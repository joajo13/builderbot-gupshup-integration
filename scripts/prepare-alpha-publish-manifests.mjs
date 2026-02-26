#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const PACKAGE_JSON_NAME = 'package.json'
const INTERNAL_SCOPE = '@joajo13-test/'

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

    for (const client of clients) {
        try {
            const output = runCommand(client.command, client.args)
            return JSON.parse(output)
        } catch (error) {
            const message = String(error?.message ?? '')
            if (message.includes('ENOENT')) continue

            const stderr = String(error?.stderr ?? '')
            throw new Error(`npm view failed for ${spec}${field ? ` ${field}` : ''}: ${stderr || message}`)
        }
    }

    throw new Error(`Unable to resolve npm client for ${spec}`)
}

const rewriteWorkspaceRanges = (deps = {}, version) => {
    let touched = false

    const rewritten = Object.fromEntries(
        Object.entries(deps).map(([name, value]) => {
            if (!name.startsWith(INTERNAL_SCOPE)) return [name, value]
            if (typeof value !== 'string') return [name, value]
            if (!value.startsWith('workspace:')) return [name, value]

            touched = true
            return [name, version]
        })
    )

    return { touched, rewritten }
}

const main = () => {
    const args = parseArgs()
    const nextVersion = String(args.version ?? '').trim()

    if (!nextVersion) {
        throw new Error('Missing required --version argument')
    }

    const publishedEslintVersion = String(runNpmView('eslint-plugin-builderbot', 'version'))
    const packagesRoot = path.resolve(process.cwd(), 'packages')
    const packageDirs = fs.readdirSync(packagesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())

    let changedFiles = 0

    for (const packageDir of packageDirs) {
        const manifestPath = path.join(packagesRoot, packageDir.name, PACKAGE_JSON_NAME)
        if (!fs.existsSync(manifestPath)) continue

        const originalRaw = fs.readFileSync(manifestPath, 'utf8')
        const manifest = JSON.parse(originalRaw)

        let changed = false
        const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

        for (const section of sections) {
            const { touched, rewritten } = rewriteWorkspaceRanges(manifest[section], nextVersion)
            if (touched) {
                manifest[section] = rewritten
                changed = true
            }
        }

        if (manifest.name === 'eslint-plugin-builderbot' && manifest.version !== publishedEslintVersion) {
            manifest.version = publishedEslintVersion
            changed = true
        }

        if (!changed) continue

        fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`, 'utf8')
        changedFiles += 1
    }

    console.log(`prepared_version=${nextVersion}`)
    console.log(`eslint_plugin_version=${publishedEslintVersion}`)
    console.log(`updated_manifests=${changedFiles}`)
}

main()
