# What is it

gh-action-release is a Github action that does the following:

1. Get the tag of the latest release
2. Read the commits from that tag up to `head`
3. Calculate a new tag version depending on the commit messages (which must follow our [Git style guide](https://github.com/decentraland/adr/blob/main/docs/ADR-6-git-style-guide.md))
4. Create a new release with that tag version, push the new tag, and generate the release notes

> [Github API](https://docs.github.com/en/rest/releases/releases#create-a-release) only looks for the merged prs when generating the release notes. The changes will be inside your release, though, they will just not appear listed in the release's description.

# Integration

Include it in a Github workflow like the following:

```yaml
name: 'release'
on:
  workflow_dispatch:
    inputs:
        dry_run:
          description: dry run
          type: boolean
          required: false
          default: false
jobs:
  release:
    runs-on: ubuntu-latest
    permissions: write-all
    steps:
      - uses: decentraland/gh-action-release@0.3.0
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          dry_run: ${{ github.event.inputs.dry_run }}
```

Note that this action receives 1 mandatory and 2 optional parameters:
- `github_token` (mandatory): neccessary for collecting the repository's data
- `dry_run` (optional): makes the action to avoid releasing. When set to true, it only prints. Default is set to false.
- `repository` (optional): needed when the workflow is being triggered by a cron schedule. Not neccessary and not recommended when triggered manually. Use as follows:
  ```yaml
  - uses: decentraland/gh-action-release@0.3.0
      with:
        github_token: ${{ secrets.GITHUB_TOKEN }}
        repository: ${{ github.repository }}
  ```

The workflow that calls it also needs `permissions: write-all` to being able to create the release, as it is in the example.

## How to run

Once integrated in any branch, go to your repository page in Github. Click on the [actions tab](https://github.com/decentraland/gh-action-release/actions), you will see the name of your workflow there and a button that reads `Run workflow` if it is triggered on `workflow_dispatch` like the one in the example above.

> :warning: **THERE MUST BE A FIRST RELEASE TO WORK**, so for now you will need to make your first release manually

### Naming convention

Following the [Git style guide](https://github.com/decentraland/adr/blob/main/docs/ADR-6-git-style-guide.md) enables us to bump the version automatically. Any commit pushed to `main` that doesn't respect the convention will be ignored when determining the new version number.

We have developed a workflow which **enforces a pr's title to follow the naming convention** to use it along with this action. Please refer to our [actions repo](https://github.com/decentraland/actions).

# Contributing

## How to build

> You'll need to have a reasonably modern version of `node` handy. This won't work with versions older than 9, for instance.

Install the dependencies  
```bash
$ npm install
```

Build the typescript and package it for distribution
```bash
$ npm run build && npm run package
```

## Changing the Code

The core funcionallity is in [src/main.ts](https://github.com/decentraland/gh-action-release/blob/main/src/main.ts)

Most toolkit and CI/CD operations involve async operations so the action is run in an async function.

The [action.yml](https://github.com/decentraland/gh-action-release/blob/main/action.yml) defines the inputs and output for your action.

## Creating a pull request

We follow the [Git style guide](https://github.com/decentraland/adr/blob/main/docs/ADR-6-git-style-guide.md) for git usage

1. In case the PR is done using a branch within the service, it should have the semantic prefix.
2. Before merging into `main` make sure the squash commit has the correct semantic type prefix.

Adopting this convention helps us keep the commit history tidy and easier to understand, but also makes it easier to write automated tools like this one on top.

Check the [Automatic version bumping]([AUTOMATIC_VERSION_BUMPING.md](https://github.com/decentraland/catalyst/blob/main/docs/AUTOMATIC_VERSION_BUMPING.md)) guide to know how your pull request's title should be.


# Releasing

This action uses itself to do its own releases! Start a release by running the [release workflow](https://github.com/decentraland/gh-action-release/actions/workflows/release.yml).
