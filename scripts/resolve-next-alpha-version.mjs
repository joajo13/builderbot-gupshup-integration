#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const MAX_PROBE_ATTEMPTS = 300

const parseArgs = () => {
    const args = process.argv.slice(2)
    const result = {}

    for (let i = 0; i < args.length; i++) {
        const current = args[i]
        if (!current.startsWith('--')) continue

        const [flag, inlineValue] = current.split('=', 2)
        const key = flag.replace(/^--/, '')
        const value = inlineValue ?? args[i + 1]

        if (inlineValue === undefined) i += 1
        result[key] = value
    }

    return result
}

const safeJson = (value) => {
    try {
        return JSON.parse(value)
    } catch {
        return value.trim()
    }
}

const runCommand = (command, args) => {
    return execFileSync(command, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    })
}

const runNpmView = (spec, field) => {
    const viewArgs = ['view', spec]
    if (field) viewArgs.push(field)
    viewArgs.push('--json')

    const clients = [
        { command: 'npm', args: viewArgs },
        { command: 'pnpm', args: ['npm', ...viewArgs] },
    ]

    let lastError = ''

    for (const client of clients) {
        try {
            const output = runCommand(client.command, client.args)
            return safeJson(output)
        } catch (error) {
            const stderr = String(error?.stderr ?? '')
            const message = String(error?.message ?? '')

            if (stderr.includes('E404') || stderr.includes('is not in this registry')) {
                return null
            }

            if (message.includes('ENOENT')) {
                lastError = `${client.command} not available`
                continue
            }

            lastError = stderr || message
            break
        }
    }

    throw new Error(`npm view failed for ${spec}${field ? ` ${field}` : ''}: ${lastError}`)
}

const readLernaVersion = () => {
    const lernaPath = path.resolve(process.cwd(), 'lerna.json')
    const lerna = JSON.parse(fs.readFileSync(lernaPath, 'utf8'))
    return String(lerna.version)
}

const parseVersion = (version) => {
    const match = version.match(/^(\d+\.\d+\.\d+)(?:-alpha\.(\d+))?$/)
    if (!match) {
        throw new Error(`Unsupported version format in lerna.json: ${version}`)
    }

    return {
        base: match[1],
        alpha: Number(match[2] ?? 0),
    }
}

const pickHighestPublishedAlpha = (versions, baseVersion) => {
    const list = Array.isArray(versions) ? versions : versions ? [versions] : []
    const regex = new RegExp(`^${baseVersion.replace(/\./g, '\\.')}-alpha\\.(\\d+)$`)

    return list.reduce((highest, current) => {
        const match = String(current).match(regex)
        if (!match) return highest
        return Math.max(highest, Number(match[1]))
    }, 0)
}

const toAlphaNumber = (version, baseVersion) => {
    if (!version) return 0

    const match = String(version).match(new RegExp(`^${baseVersion.replace(/\./g, '\\.')}-alpha\\.(\\d+)$`))
    return match ? Number(match[1]) : 0
}

const existsInRegistry = (pkgName, version) => {
    const response = runNpmView(`${pkgName}@${version}`, 'version')
    return Boolean(response)
}

const appendGithubOutput = (nextVersion, packageName) => {
    const githubOutput = process.env.GITHUB_OUTPUT
    if (!githubOutput) return

    fs.appendFileSync(githubOutput, `version=${nextVersion}\n`, 'utf8')
    fs.appendFileSync(githubOutput, `package=${packageName}\n`, 'utf8')
}

const main = () => {
    const args = parseArgs()
    const packageName = args.package || '@joajo13-test/bot'

    const lernaVersion = readLernaVersion()
    const { base, alpha: localAlpha } = parseVersion(lernaVersion)

    const distTagVersion = runNpmView(packageName, 'dist-tags.alpha')
    const distTagAlpha = toAlphaNumber(distTagVersion, base)

    const allVersions = runNpmView(packageName, 'versions')
    const publishedAlpha = pickHighestPublishedAlpha(allVersions, base)

    let nextAlpha = Math.max(localAlpha + 1, distTagAlpha + 1, publishedAlpha + 1)
    let attempts = 0

    while (attempts < MAX_PROBE_ATTEMPTS) {
        const candidate = `${base}-alpha.${nextAlpha}`
        if (!existsInRegistry(packageName, candidate)) {
            appendGithubOutput(candidate, packageName)

            console.log(`base=${base}`)
            console.log(`local_alpha=${localAlpha}`)
            console.log(`dist_tag_alpha=${distTagAlpha}`)
            console.log(`published_alpha=${publishedAlpha}`)
            console.log(`selected_alpha=${nextAlpha}`)
            console.log(`next_version=${candidate}`)
            return
        }

        nextAlpha += 1
        attempts += 1
    }

    throw new Error(
        `Unable to find an available alpha version for ${packageName} after ${MAX_PROBE_ATTEMPTS} attempts from ${base}-alpha.${Math.max(localAlpha + 1, distTagAlpha + 1, publishedAlpha + 1)}`
    )
}

main()
