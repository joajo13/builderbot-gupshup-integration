import { test } from 'uvu'
import * as assert from 'uvu/assert'

import { createTemplateMetadata, DEFAULT_PACKAGE_SCOPE, getPackageScope } from '../src/interactive/package-scope'

test('createTemplateMetadata defaults dependencies to @joajo13-test scope', () => {
    const templateMetadata = createTemplateMetadata(
        {
            dependencies: {
                '@builderbot/bot': 'latest',
                '@builderbot/provider-gupshup': 'latest',
                dotenv: '^16.4.7',
            },
            devDependencies: {
                '@builderbot/provider-meta': 'latest',
                'eslint-plugin-builderbot': '^1.0.0',
            },
        },
        '1.3.15-alpha.15'
    )

    assert.equal(templateMetadata.dependencies['@joajo13-test/bot'], '1.3.15-alpha.15')
    assert.equal(templateMetadata.dependencies['@joajo13-test/provider-gupshup'], '1.3.15-alpha.15')
    assert.not.ok(templateMetadata.dependencies['@builderbot/bot'])
    assert.equal(templateMetadata.dependencies.dotenv, '^16.4.7')
    assert.equal(templateMetadata.devDependencies['@joajo13-test/provider-meta'], '1.3.15-alpha.15')
    assert.equal(templateMetadata.devDependencies['eslint-plugin-builderbot'], '^1.0.0')
})

test('getPackageScope keeps scope argument and env override behavior', () => {
    assert.is(getPackageScope({}), DEFAULT_PACKAGE_SCOPE)
    assert.is(getPackageScope({}, '@custom-scope'), '@custom-scope')
    assert.is(getPackageScope({ scope: '@arg-scope' }, '@custom-scope'), '@arg-scope')
})

test.run()
