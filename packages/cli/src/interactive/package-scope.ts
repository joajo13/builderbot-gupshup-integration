export const DEFAULT_PACKAGE_SCOPE = '@joajo13-test'
export const BUILDERBOT_SCOPE = '@builderbot'

export const normalizePackageScope = (scope: string | undefined): string => {
    const value = (scope ?? DEFAULT_PACKAGE_SCOPE).trim().replace(/\/$/, '')
    if (!value.startsWith('@')) {
        throw new Error(`INVALID_PACKAGE_SCOPE: ${scope}`)
    }
    return value
}

export const getPackageScope = (
    args: Record<string, string>,
    envScope = process.env.BUILDERBOT_PACKAGE_SCOPE
): string => {
    return normalizePackageScope(args['scope'] ?? envScope)
}

export const updateTemplateDependencies = (
    deps: Record<string, string> = {},
    version: string,
    packageScope: string
): Record<string, string> => {
    const sourceScope = `${BUILDERBOT_SCOPE}/`
    const targetScope = `${packageScope}/`

    const nextDependencies = Object.entries(deps).map(([dep, depVersion]) => {
        if (dep.startsWith(sourceScope)) return [dep.replace(sourceScope, targetScope), version]
        if (dep.startsWith(targetScope)) return [dep, version]
        return [dep, depVersion]
    })

    return Object.fromEntries(nextDependencies)
}

export const createTemplateMetadata = (
    packageJson: Record<string, any>,
    version: string,
    packageScope: string = DEFAULT_PACKAGE_SCOPE
): Record<string, any> => {
    return {
        ...packageJson,
        dependencies: updateTemplateDependencies(packageJson.dependencies, version, packageScope),
        devDependencies: updateTemplateDependencies(packageJson.devDependencies, version, packageScope),
    }
}
