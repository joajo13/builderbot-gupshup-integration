import { intro, outro, confirm, select, spinner, isCancel, cancel, note } from '@clack/prompts'
import { existsSync } from 'fs'
import { readdir, readFile, rename, writeFile } from 'fs/promises'
import { extname, join } from 'path'
import color from 'picocolors'

import { checkNodeVersion, checkGit } from '../check'
import { AVAILABLE_LANGUAGES, PROVIDER_DATA, PROVIDER_LIST, validateTemplateCombination } from '../configuration'
import { copyBaseApp } from '../create-app'
import { startInteractiveLegacy } from '../interactive-legacy'

interface CheckResult {
    pass: boolean
    message: string
}

const DEFAULT_PACKAGE_SCOPE = '@joajo13-test'
const BUILDERBOT_SCOPE = '@builderbot'
const SCOPE_FILE_EXTENSIONS = new Set(['.js', '.ts', '.json', '.cjs', '.mjs'])

const normalizePackageScope = (scope: string | undefined): string => {
    const value = (scope ?? DEFAULT_PACKAGE_SCOPE).trim().replace(/\/$/, '')
    if (!value.startsWith('@')) {
        throw new Error(`INVALID_PACKAGE_SCOPE: ${scope}`)
    }
    return value
}

const getPackageScope = (args: Record<string, string>): string => {
    return normalizePackageScope(args['scope'] ?? process.env.BUILDERBOT_PACKAGE_SCOPE)
}

const handleLegacyCli = async (): Promise<void> => {
    await startInteractiveLegacy()
}

const getVersion = async (): Promise<string> => {
    try {
        const PATHS_DIR: string[] = [
            join(__dirname, 'package.json'),
            join(__dirname, '..', 'package.json'),
            join(__dirname, '..', '..', 'package.json'),
        ]

        const PATH_INDEX: number = PATHS_DIR.findIndex((a: string) => existsSync(a))
        if (PATH_INDEX === -1) {
            throw new Error('No package update file found.')
        }

        const raw = await readFile(PATHS_DIR[PATH_INDEX], 'utf-8')
        const parseRaw = JSON.parse(raw)
        return Promise.resolve(parseRaw.version)
    } catch (e) {
        console.log(`Error: `, e)
        return Promise.resolve('latest')
    }
}

const bannerDone = (templateName: string = '', language: string): void => {
    const notes = [color.yellow(` cd ${templateName} `), color.yellow(` npm install `)]

    if (language === 'ts') {
        notes.push(color.yellow(` npm run dev `))
    } else {
        notes.push(color.yellow(` npm start `))
    }

    const doneNote = [
        ``,
        `📄 Documentation:`,
        `   https://builderbot.app`,
        ``,
        `🤖 Issues? Join:`,
        `   https://link.codigoencasa.com/DISCORD`,
    ]

    note([...notes, ...doneNote].join('\n'), 'Instructions:')
}

const systemRequirements = async (): Promise<void> => {
    const stepCheckGit: CheckResult = await checkGit()

    if (!stepCheckGit.pass) {
        note(stepCheckGit.message)
        cancel('Operation canceled')
        return process.exit(0)
    }

    const stepCheckNode: CheckResult = await checkNodeVersion()
    if (!stepCheckNode.pass) {
        note(stepCheckNode.message)
        cancel('Operation canceled')
        return process.exit(0)
    }
}

const replaceTemplatePackageScope = async (projectPath: string, packageScope: string): Promise<void> => {
    if (packageScope === BUILDERBOT_SCOPE) {
        return
    }

    const sourceScope = `${BUILDERBOT_SCOPE}/`
    const targetScope = `${packageScope}/`

    const replaceScopeInDir = async (dirPath: string): Promise<void> => {
        const entries = await readdir(dirPath, { withFileTypes: true })

        for (const entry of entries) {
            const fullPath = join(dirPath, entry.name)

            if (entry.isDirectory()) {
                await replaceScopeInDir(fullPath)
                continue
            }

            if (!SCOPE_FILE_EXTENSIONS.has(extname(entry.name))) {
                continue
            }

            const raw = await readFile(fullPath, 'utf-8')
            if (!raw.includes(sourceScope)) {
                continue
            }

            const nextRaw = raw.replaceAll(sourceScope, targetScope)
            await writeFile(fullPath, nextRaw)
        }
    }

    await replaceScopeInDir(projectPath)
}

const setVersionTemplate = async (projectPath: string, version: string, packageScope: string) => {
    try {
        const pkg = join(projectPath, 'package.json')
        const raw = await readFile(pkg, 'utf-8')
        const parseRaw = JSON.parse(raw)
        const sourceScope = `${BUILDERBOT_SCOPE}/`
        const targetScope = `${packageScope}/`

        const updateDeps = (deps: Record<string, string> = {}): Record<string, string> => {
            const nextDependencies = Object.entries(deps).map(([dep, depVersion]) => {
                if (dep.startsWith(sourceScope)) return [dep.replace(sourceScope, targetScope), version]
                if (dep.startsWith(targetScope)) return [dep, version]
                if (dep === 'eslint-plugin-builderbot') return [dep, version]
                return [dep, depVersion]
            })

            return Object.fromEntries(nextDependencies)
        }

        parseRaw.dependencies = updateDeps(parseRaw.dependencies)
        parseRaw.devDependencies = updateDeps(parseRaw.devDependencies)
        await writeFile(pkg, JSON.stringify(parseRaw, null, 2))
    } catch (e) {
        console.log(`Error Set Version: `, e)
    }
}

const createApp = async (templateName: string | null): Promise<string> => {
    if (!templateName) throw new Error('TEMPLATE_NAME_INVALID: ' + templateName)
    const possiblesPath: string[] = [
        join(__dirname, '..', '..', 'starters', 'apps', templateName),
        join(__dirname, '..', 'starters', 'apps', templateName),
        join(__dirname, 'starters', 'apps', templateName),
    ]
    const indexOfPath: string | undefined = possiblesPath.find((a) => existsSync(a))
    if (!indexOfPath) throw new Error('TEMPLATE_PATH_NOT_FOUND: ' + templateName)
    const pathTemplate = join(process.cwd(), templateName)
    await copyBaseApp(indexOfPath, pathTemplate)
    await rename(join(pathTemplate, '_gitignore'), join(pathTemplate, '.gitignore'))
    return pathTemplate
}

const validateTemplateSupportOrExit = (provider: string, language: string, database: string): void => {
    const validation = validateTemplateCombination({ provider, language, database })
    if (validation.pass) {
        return
    }

    cancel(validation.message)
    process.exit(0)
}

const startInteractive = async (version: string): Promise<void> => {
    try {
        const stepContinue = await confirm({
            message: 'Do you want to continue?',
        })

        if (!stepContinue) {
            cancel('Operation canceled')
            return process.exit(0)
        }

        if (isCancel(stepContinue)) {
            cancel('Operation canceled')
            return process.exit(0)
        }

        const stepProvider = await select({
            message: 'Which WhatsApp provider do you want to use?',
            options: PROVIDER_LIST,
        })

        if (isCancel(stepProvider)) {
            cancel('Operation canceled')
            return process.exit(0)
        }

        const stepDatabase = await select({
            message: 'Which database do you want to use?',
            options: PROVIDER_DATA,
        })

        if (isCancel(stepDatabase)) {
            cancel('Operation canceled')
            return process.exit(0)
        }

        const stepLanguage = await select({
            message: 'Which language do you prefer to use?',
            options: AVAILABLE_LANGUAGES,
        })

        if (isCancel(stepLanguage)) {
            cancel('Operation canceled')
            return process.exit(0)
        }

        validateTemplateSupportOrExit(stepProvider as string, stepLanguage as string, stepDatabase as string)

        await createBot({
            stepLanguage: stepLanguage as string,
            stepProvider: stepProvider as string,
            stepDatabase: stepDatabase as string,
            version,
            packageScope: getPackageScope({}),
        })
    } catch (e: any) {
        logError(e)
    }
}

const createBot = async ({
    stepLanguage,
    stepProvider,
    stepDatabase,
    version,
    packageScope,
}: {
    stepLanguage: string
    stepProvider: string
    stepDatabase: string
    version: string
    packageScope: string
}): Promise<void> => {
    try {
        const s = spinner()
        s.start('Checking requirements')
        await systemRequirements()
        s.stop('Checking requirements')

        s.start(`Creating project...`)
        const NAME_DIR: string = ['base', stepLanguage, stepProvider, stepDatabase].join('-')
        const projectPath = await createApp(NAME_DIR)
        s.stop(`Creating project...`)
        await replaceTemplatePackageScope(projectPath, packageScope)
        bannerDone(NAME_DIR, stepLanguage as string)
        await setVersionTemplate(projectPath, version, packageScope)
        outro(color.bgGreen(' Successfully completed! '))
    } catch (e: any) {
        logError(e)
    }
}

const startWithArgs = async (version: string, args: Record<string, string>): Promise<void> => {
    try {
        const stepProvider = args['provider']
        const stepDatabase = args['database']
        const stepLanguage = args['language']
        await createBot({
            stepLanguage,
            stepProvider,
            stepDatabase,
            version,
            packageScope: getPackageScope(args),
        })
    } catch (e: any) {
        logError(e)
    }
}

function getArgs(args: string[]): Record<string, string> {
    const result: Record<string, string> = {}
    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        if (arg.startsWith('--')) {
            const [key, value] = arg.split('=')
            result[key.slice(2)] = value
        }
    }
    return result
}

function validateArgs(args: Record<string, string>): void {
    if (!args['provider'] || !args['database'] || !args['language']) {
        cancel(`\nInvalid arguments: You must send all three arguments: --provider, --database and --language
        \nExample: --provider=baileys --database=mongo --language=js
        \nIf you want to use the interactive mode, just run the command without arguments.`)
        process.exit(0)
    }
    if (args['provider'] && !PROVIDER_LIST.some((p) => p.value === args['provider'])) {
        cancel(`Invalid provider: ${args['provider']}`)
        process.exit(0)
    }
    if (args['database'] && !PROVIDER_DATA.some((p) => p.value === args['database'])) {
        cancel(`Invalid database: ${args['database']}`)
        process.exit(0)
    }
    if (args['language'] && !AVAILABLE_LANGUAGES.some((p) => p.value === args['language'])) {
        cancel(`Invalid language: ${args['language']}`)
        process.exit(0)
    }

    if (args['scope']) {
        try {
            normalizePackageScope(args['scope'])
        } catch {
            cancel(`Invalid package scope: ${args['scope']}. Example: --scope=@joajo13-test`)
            process.exit(0)
        }
    }

    validateTemplateSupportOrExit(args['provider'], args['language'], args['database'])
}

const logError = async (e: any): Promise<void> => {
    console.log(e)
    if (e?.code === 'ERR_TTY_INIT_FAILED') return handleLegacyCli()
    cancel([`Oops! 🙄 something is not right.`, `Check the minimum requirements in the documentation`].join('\n'))
    return process.exit(0)
}

const start = async (): Promise<void> => {
    const version = await getVersion()
    console.clear()
    console.log('')

    intro(` Let's create a ${color.bgCyan(' Chatbot ' + 'v' + version)} ✨`)
    const args = getArgs(process.argv.slice(2))
    if (!Object.keys(args).length) {
        await startInteractive(version)
    } else {
        validateArgs(args)
        await startWithArgs(version, args)
    }
}

export { start }
