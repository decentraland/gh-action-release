import * as core from '@actions/core'
import * as github from '@actions/github'
import {Octokit} from '@octokit/rest'
import {paginateRest} from '@octokit/plugin-paginate-rest'

const semverRegexString = '^([0-9]+).([0-9]+).([0-9]+)$'
const parenthesisRegex = '(\(.+\))?'

async function run(): Promise<void> {
  const token = core.getInput('github_token')
  const dryRun = core.getInput('dry_run') === 'true'
  const repository = core.getInput('repository')

  const PluginOctokit = Octokit.plugin(paginateRest)
  const octokit = new PluginOctokit({
    auth: token
  })

  try {
    // Get the JSON webhook payload for the event that triggered the workflow
    let owner = github.context.payload.repository?.owner.login ?? ''
    let repo = github.context.payload.repository?.name ?? ''
    core.debug(`Context: ${JSON.stringify(github.context)}`)
    core.info(`Dry run: ${dryRun}`)

    // Override owner and repo if repository input is found
    if (repository !== '') {
      core.warning(`Repository is being overriden to: ${repository}. Use this only for scheduled workflows`)
      owner = repository.split('/')[0]
      repo = repository.split('/')[1]
      core.warning(`New owner: ${owner}`)
      core.warning(`New repo: ${repo}`)
    }

    // Fail if owner or repo are not filled properly
    checkRepoAndOwner(owner, repo)

    // Get last tag
    const lastTag = await getLastTag(octokit, owner, repo)

    // Get commits between last tag and now
    const commitsMessages = await getCommitMessages(octokit, owner, repo, lastTag)

    // Calculate new tag depending on commit messages
    const newTag = calculateNewTag(commitsMessages, lastTag)

    // Create a release
    createRelease(octokit, owner, repo, newTag, dryRun)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()

function checkRepoAndOwner(owner: string, repo: string): void {
  const context = JSON.stringify(github.context)
  if (owner === '') {
    throw new Error(`Owner retrieved from payload is not valid. Context ${context}`)
  }
  if (repo === '') {
    throw new Error(`Repo retrieved from payload is not valid. Context ${context}`)
  }
}

async function getLastTag(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<string> {
  // Get latest release
  const latestRelease = await octokit.rest.repos.getLatestRelease({
    owner,
    repo
  })
  const lastTag = latestRelease.data.tag_name
  core.info(`Last tag: ${lastTag}`)

  // Fail if tag is not semver
  if (!lastTag.match(semverRegexString)) {
    throw new Error(`Latest release tag name is not semver. Found: ${lastTag}`)
  }
  return lastTag
}

async function getCommitMessages(octokit: Octokit, owner: string, repo: string, lastTag: string): Promise<string[]> {
  // Get commits between last tag and now
  const commits = await octokit.paginate(
    octokit.rest.repos.compareCommits,
    {
      owner,
      repo,
      base: lastTag,
      head: 'HEAD',
      per_page: 100
    },
    response => response.data.commits
  )

  // Extract messages
  const commitsMessages = commits.map(commit => commit.commit.message)
  core.info(`${commitsMessages.length} commits found: [${commitsMessages}]`)

  return commitsMessages
}

function calculateNewTag(commitsMessages: string[], lastTag: string): string {
  // Decide what to bump depending on commit messages
  let bumpPatch = false
  let bumpMinor = false
  let bumpMajor = false
  const nonStandarizedCommits = []
  for (const message of commitsMessages) {
    const patchRegex = new RegExp(`^(chore|docs|fix|refactor|revert|style|test)${parenthesisRegex}: .+$`, 'gm')
    const minorRegex = new RegExp(`^feat${parenthesisRegex}: .+$`, 'gm')
    const majorRegex = new RegExp(`^break${parenthesisRegex}: .+$`, 'gm')
    if (patchRegex.exec(message)) {
      bumpPatch = true
    } else if (minorRegex.exec(message)) {
      bumpMinor = true
    } else if (majorRegex.exec(message)) {
      bumpMajor = true
    } else {
      nonStandarizedCommits.push(message)
    }
  }
  core.info(`${nonStandarizedCommits.length} commits doesn't respect the convention: [${nonStandarizedCommits}]`)
  core.info(`Bump major: ${bumpMajor}`)
  core.info(`Bump minor: ${bumpMinor}`)
  core.info(`Bump patch: ${bumpPatch}`)

  // Bump the version
  const newTag = bumpTag(lastTag, bumpMajor, bumpMinor, bumpPatch)
  core.info(`New tag ${newTag}`)
  return newTag
}

function bumpTag(lastTag: string, bumpMajor: boolean, bumpMinor: boolean, bumpPatch: boolean): string {
  const semverRegex = new RegExp(semverRegexString, 'g')
  const match = semverRegex.exec(lastTag)
  if (match) {
    if (bumpMajor) {
      const bump = (parseInt(match[1]) + 1).toString()
      return lastTag.replace(semverRegex, `${bump}.0.0`)
    } else if (bumpMinor) {
      const bump = (parseInt(match[2]) + 1).toString()
      return lastTag.replace(semverRegex, `$1.${bump}.0`)
    } else if (bumpPatch) {
      const bump = (parseInt(match[3]) + 1).toString()
      return lastTag.replace(semverRegex, `$1.$2.${bump}`)
    }
  }
  return lastTag
}

function createRelease(octokit: Octokit, owner: string, repo: string, newTag: string, dryRun: boolean): void {
  if (dryRun) {
    core.info(`Release ${newTag} was not created since it's a dry run`)
  } else {
    octokit.rest.repos.createRelease({
      owner,
      repo,
      tag_name: newTag,
      generate_release_notes: true
    })
    core.info(`Release ${newTag} created`)
  }
}
