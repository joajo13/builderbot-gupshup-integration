import { describe, expect, test } from '@jest/globals'
import type { ProviderClass } from '@joajo13-test/bot'

import { GupshupProvider } from '../src/gupshup/provider'
import type { GupshupGlobalVendorArgs } from '../src/types'

describe('#type compatibility', () => {
    test('GupshupProvider matches bot ProviderClass contract', () => {
        type ProviderConstructor = new (args: GupshupGlobalVendorArgs) => ProviderClass
        const providerConstructor: ProviderConstructor = GupshupProvider

        expect(providerConstructor).toBe(GupshupProvider)
    })
})
