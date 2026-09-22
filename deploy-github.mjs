/**
 * Automated GitHub Pages Publisher
 * Creates repo, uploads files, enables GitHub Pages via GitHub REST API
 */
import fs from 'fs';
import path from 'path';

export async function deployToGitHubPages(token, repoName = 'pixel-monopoly') {
  const headers = {
    'Authorization': `Bearer ${token.trim()}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'Monopoly-Deployer',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  console.log('1. Verifying GitHub token...');
  const userRes = await fetch('https://api.github.com/user', { headers });
  if (!userRes.ok) {
    throw new Error(`Invalid GitHub Token: ${userRes.status} ${userRes.statusText}`);
  }
  const user = await userRes.json();
  const username = user.login;
  console.log(`✓ Authenticated as: ${username}`);

  console.log(`2. Checking or creating repository '${repoName}'...`);
  let repoRes = await fetch(`https://api.github.com/repos/${username}/${repoName}`, { headers });
  if (!repoRes.ok) {
    const createRes = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: repoName,
        description: 'Pixel Monopoly Web Game',
        private: false,
        auto_init: true
      })
    });
    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`Failed to create repository: ${err}`);
    }
    console.log(`✓ Created public repository: https://github.com/${username}/${repoName}`);
    // Wait for repo init
    await new Promise(r => setTimeout(r, 2000));
  } else {
    console.log(`✓ Repository already exists: https://github.com/${username}/${repoName}`);
  }

  console.log('3. Gathering project files...');
  const projectDir = process.cwd();
  const filesToUpload = [];

  function scanDir(dir, relPath = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      const fileRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        scanDir(fullPath, fileRelPath);
      } else if (entry.isFile()) {
        const content = fs.readFileSync(fullPath);
        filesToUpload.push({
          path: fileRelPath,
          content: content.toString('base64')
        });
      }
    }
  }

  scanDir(projectDir);
  console.log(`✓ Found ${filesToUpload.length} files to upload`);

  console.log('4. Uploading files via Git Tree API...');
  // Get latest commit SHA of main branch
  let refRes = await fetch(`https://api.github.com/repos/${username}/${repoName}/git/ref/heads/main`, { headers });
  if (!refRes.ok) {
    refRes = await fetch(`https://api.github.com/repos/${username}/${repoName}/git/ref/heads/master`, { headers });
  }
  const refData = await refRes.json();
  const latestCommitSha = refData.object.sha;

  // Create tree
  const treeItems = filesToUpload.map(f => ({
    path: f.path,
    mode: '100644',
    type: 'blob',
    content: Buffer.from(f.content, 'base64').toString('utf8')
  }));

  const treeRes = await fetch(`https://api.github.com/repos/${username}/${repoName}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tree: treeItems })
  });
  const treeData = await treeRes.json();

  // Create commit
  const commitRes = await fetch(`https://api.github.com/repos/${username}/${repoName}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'Deploy latest Pixel Monopoly update',
      tree: treeData.sha,
      parents: [latestCommitSha]
    })
  });
  const commitData = await commitRes.json();

  // Update ref
  await fetch(`https://api.github.com/repos/${username}/${repoName}/git/refs/heads/main`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ sha: commitData.sha, force: true })
  });
  console.log('✓ Files uploaded successfully');

  console.log('5. Enabling GitHub Pages...');
  const pagesRes = await fetch(`https://api.github.com/repos/${username}/${repoName}/pages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      source: { branch: 'main', path: '/' }
    })
  });
  
  const siteUrl = `https://${username.toLowerCase()}.github.io/${repoName}/`;
  console.log(`\n🎉 ГОТОВО! Сайт опубликован на GitHub Pages:\n👉 ${siteUrl}\n`);
  return siteUrl;
}

if (process.argv[2]) {
  deployToGitHubPages(process.argv[2], process.argv[3] || 'pixel-monopoly')
    .then(url => console.log('Success:', url))
    .catch(err => {
      console.error('Deploy error:', err);
      process.exit(1);
    });
}
