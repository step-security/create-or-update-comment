import * as core from '@actions/core'
import {Inputs, createOrUpdateComment} from './create-or-update-comment'
import {existsSync, readFileSync} from 'fs'
import * as fs from 'fs'
import {inspect} from 'util'
import * as utils from './utils'
import axios, {isAxiosError} from 'axios'

async function validateSubscription(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH
  let repoPrivate: boolean | undefined

  if (eventPath && fs.existsSync(eventPath)) {
    const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'))
    repoPrivate = eventData?.repository?.private
  }

  const upstream = 'peter-evans/create-or-update-comment'
  const action = process.env.GITHUB_ACTION_REPOSITORY
  const docsUrl =
    'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions'

  core.info('')
  core.info('[1;36mStepSecurity Maintained Action[0m')
  core.info(`Secure drop-in replacement for ${upstream}`)
  if (repoPrivate === false)
    core.info('[32m✓ Free for public repositories[0m')
  core.info(`[36mLearn more:[0m ${docsUrl}`)
  core.info('')

  if (repoPrivate === false) return

  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com'
  const body: Record<string, string> = {action: action || ''}
  if (serverUrl !== 'https://github.com') body.ghes_server = serverUrl
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body,
      {timeout: 3000}
    )
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 403) {
      core.error(
        `[1;31mThis action requires a StepSecurity subscription for private repositories.[0m`
      )
      core.error(
        `[31mLearn how to enable a subscription: ${docsUrl}[0m`
      )
      process.exit(1)
    }
    core.info('Timeout or API not reachable. Continuing to next step.')
  }
}

function getBody(inputs: Inputs) {
  if (inputs.body) {
    return inputs.body
  } else if (inputs.bodyPath) {
    return readFileSync(inputs.bodyPath, 'utf-8')
  } else {
    return ''
  }
}

async function run(): Promise<void> {
  try {
    await validateSubscription()
    const inputs: Inputs = {
      token: core.getInput('token'),
      repository: core.getInput('repository'),
      issueNumber: Number(core.getInput('issue-number')),
      commentId: Number(core.getInput('comment-id')),
      body: core.getInput('body'),
      bodyPath: core.getInput('body-path') || core.getInput('body-file'),
      editMode: core.getInput('edit-mode'),
      appendSeparator: core.getInput('append-separator'),
      reactions: utils.getInputAsArray('reactions'),
      reactionsEditMode: core.getInput('reactions-edit-mode')
    }
    core.debug(`Inputs: ${inspect(inputs)}`)

    if (!['append', 'replace'].includes(inputs.editMode)) {
      throw new Error(`Invalid edit-mode '${inputs.editMode}'.`)
    }

    if (!['append', 'replace'].includes(inputs.reactionsEditMode)) {
      throw new Error(
        `Invalid reactions edit-mode '${inputs.reactionsEditMode}'.`
      )
    }

    if (!['newline', 'space', 'none'].includes(inputs.appendSeparator)) {
      throw new Error(`Invalid append-separator '${inputs.appendSeparator}'.`)
    }

    if (inputs.bodyPath && inputs.body) {
      throw new Error("Only one of 'body' or 'body-path' can be set.")
    }

    if (inputs.bodyPath) {
      if (!existsSync(inputs.bodyPath)) {
        throw new Error(`File '${inputs.bodyPath}' does not exist.`)
      }
    }

    const body = getBody(inputs)

    if (inputs.commentId) {
      if (!body && !inputs.reactions) {
        throw new Error("Missing comment 'body', 'body-path', or 'reactions'.")
      }
    } else if (inputs.issueNumber) {
      if (!body) {
        throw new Error("Missing comment 'body' or 'body-path'.")
      }
    } else {
      throw new Error("Missing either 'issue-number' or 'comment-id'.")
    }

    createOrUpdateComment(inputs, body)
  } catch (error) {
    core.debug(inspect(error))
    const errMsg = utils.getErrorMessage(error)
    core.setFailed(errMsg)
    if (errMsg == 'Resource not accessible by integration') {
      core.error(`See this action's readme for details about this error`)
    }
  }
}

run()
