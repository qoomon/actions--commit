const fs = require('fs')

module.exports = async ({exec, github}) => {
  const inputMessageLines = process.env.INPUT_MESSAGE.split('\n')
  const message = {
      headline:inputMessageLines[0].trim(),
      body: inputMessageLines.slice(1).join('\n').trim() || undefined,
  }
  
  const repositoryNameWithOwner = await execCommand('git remote get-url --push origin')
      .then(({stdout}) => stdout.trim().replace(/.*?([^/:]+\/[^/]+?)(?:\.git)?$/, '$1'))
  
  const branchName = await execCommand('git branch --show-current')
      .then(({stdout}) => stdout.trim())
  
  const expectedHeadOid = await execCommand('git rev-parse HEAD')
      .then(({stdout}) => stdout.trim())
  
  const fileChanges = {
      additions: await execCommand('git diff --cached --name-only --diff-filter=AM')
          .then(({stdout}) => stdout.split('\n').filter(path => path.trim() !== ''))
          .then((paths) => paths.map((path) => ({
              path,
              contents: fs.readFileSync(path).toString('base64'),
          }))),
      deletions: await execCommand('git diff --cached --name-only --diff-filter=D')
          .then(({stdout}) => stdout.split('\n').filter(path => path.trim() !== ''))
          .then((paths) => paths.map((path) => ({path}))),
  }
  
  const input = {
      branch: {
          repositoryNameWithOwner,
          branchName,
      },
      expectedHeadOid,
      fileChanges,
      message,
  }
  
  console.info('CreateCommitOnBranchInput:', JSON.stringify({
      ...input,
      fileChanges: {
          additions: input.fileChanges.additions.map(({path}) => path),
          deletions: input.fileChanges.deletions,
      }
  }, null, 2))
  
  const commit = await github.graphql(`mutation ($input: CreateCommitOnBranchInput!) {
      createCommitOnBranch(input: $input) {
          commit {
              oid
          }
      }
  }`, {input})
  
  console.log('Commit:', commit.createCommitOnBranch.commit.oid)
  
  await execCommand(`git pull origin ${branchName}`)

  // --- Utils ---
  async function execCommand(command) {
      const result = {stdout: '', stderr: ''}
      await exec.exec(command, null, {
          listeners: {
              stdout(data) {
                  result.stdout += data.toString()
              },
              stderr(data) {
                  result.stderr += data.toString()
              },
          },
      })
      return result
  }
}
          
