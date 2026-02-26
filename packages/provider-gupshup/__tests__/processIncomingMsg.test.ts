import { beforeEach, describe, expect, jest, test } from '@jest/globals'

import { GupshupCloudIncomingMessageArgs, GupshupGlobalVendorArgs } from '../src/types'
import { processIncomingMessage } from '../src/utils/processIncomingMsg'

jest.mock('@joajo13-test/bot', () => ({
    utils: {
        generateRefProvider: jest.fn((type: string) => `__${type}__`),
    },
}))

describe('#processIncomingMessage', () => {
    const mockArgs: GupshupGlobalVendorArgs = {
        name: 'test-bot',
        port: 3000,
        apiKey: 'test-api-key',
        srcName: 'test-app',
        phoneNumber: '15556581240',
    }

    const createMockMessage = (
        type: string,
        messagePayload: Record<string, any>,
        senderName: string = 'John Doe',
        source: string = '5491155551234'
    ): GupshupCloudIncomingMessageArgs => ({
        metadata: {
            display_phone_number: '15556581240',
            phone_number_id: '862813713572372',
        },
        contact: {
            profile: { name: senderName },
            wa_id: source,
        },
        message: {
            from: source,
            id: `wamid_${Date.now()}`,
            timestamp: '1770811963',
            type,
            ...messagePayload,
        },
    })

    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('should process text message correctly', async () => {
        const rawMessage = createMockMessage('text', { text: { body: 'Hola mundo' } })

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect(result).toEqual(
            expect.objectContaining({
                from: '5491155551234',
                name: 'John Doe',
                body: 'Hola mundo',
                url: '',
                host: { phone: '15556581240' },
                type: 'text',
            })
        )
    })

    test('should dispatch using canonical lowercase type when payload type casing differs', async () => {
        const rawMessage = createMockMessage(' TEXT ', { text: { body: 'Hola canonico' } })

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect(result).toEqual(
            expect.objectContaining({
                type: 'text',
                body: 'Hola canonico',
            })
        )
    })

    test('should process image message correctly', async () => {
        const rawMessage = createMockMessage(
            'image',
            { image: { url: 'https://example.com/image.jpg' } },
            'Jane',
            '5491155559999'
        )

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect(result?.from).toBe('5491155559999')
        expect(result?.url).toBe('https://example.com/image.jpg')
        expect(result?.body).toContain('_event_media_')
    })

    test('should include compatibility media fields for media messages', async () => {
        const rawMessage = createMockMessage('image', {
            image: {
                id: 'media-001',
                url: 'https://example.com/image.jpg',
                mime_type: 'image/jpeg',
                filename: 'image.jpg',
                caption: 'Hola',
                sha256: 'hash',
            },
        })

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect((result as any)?.id).toBe(rawMessage.message.id)
        expect((result as any)?.message_id).toBe(rawMessage.message.id)
        expect((result as any)?.timestamp).toBe(rawMessage.message.timestamp)
        expect(result?.type).toBe('image')
        expect((result as any)?.fileData).toEqual({
            url: 'https://example.com/image.jpg',
            id: 'media-001',
            mime_type: 'image/jpeg',
            filename: 'image.jpg',
            caption: 'Hola',
            sha256: 'hash',
        })
    })

    test('should process audio message correctly', async () => {
        const rawMessage = createMockMessage(
            'audio',
            { audio: { url: 'https://example.com/audio.ogg' } },
            'Carlos',
            '5491155558888'
        )

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect(result?.from).toBe('5491155558888')
        expect(result?.url).toBe('https://example.com/audio.ogg')
        expect(result?.body).toContain('_event_voice_note_')
    })

    test('should process document message correctly', async () => {
        const rawMessage = createMockMessage(
            'document',
            { document: { url: 'https://example.com/doc.pdf' } },
            'Maria',
            '5491155557777'
        )

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect(result?.from).toBe('5491155557777')
        expect(result?.url).toBe('https://example.com/doc.pdf')
        expect(result?.body).toContain('_event_document_')
    })

    test('should process location message correctly', async () => {
        const rawMessage = createMockMessage(
            'location',
            { location: { latitude: '-34.6037', longitude: '-58.3816' } },
            'Pedro',
            '5491155556666'
        )

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect(result?.from).toBe('5491155556666')
        expect(result?.body).toContain('_event_location_')
        expect(result?.latitude).toBe('-34.6037')
        expect(result?.longitude).toBe('-58.3816')
    })

    test('should process interactive reply messages', async () => {
        const rawMessage = createMockMessage(
            'interactive',
            {
                interactive: {
                    type: 'button_reply',
                    button_reply: {
                        id: 'btn_1',
                        title: 'Confirmar',
                    },
                },
            },
            'Sofia',
            '5491155554444'
        )

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect(result?.from).toBe('5491155554444')
        expect(result?.body).toBe('Confirmar')
        expect(result?.interactiveId).toBe('btn_1')
        expect((result as any)?.title_button_reply).toBe('Confirmar')
    })

    test('should map legacy button payload compatibility fields with payload precedence', async () => {
        const rawMessage = createMockMessage('button', {
            button: {
                payload: 'BTN_PAYLOAD_1',
                text: 'Boton visible',
            },
        })

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect(result?.type).toBe('button')
        expect(result?.body).toBe('BTN_PAYLOAD_1')
        expect((result as any)?.buttonPayload).toBe('BTN_PAYLOAD_1')
        expect((result as any)?.payload).toBe('BTN_PAYLOAD_1')
        expect((result as any)?.title_button_reply).toBe('BTN_PAYLOAD_1')
    })

    test('should expose list reply compatibility fields', async () => {
        const rawMessage = createMockMessage('interactive', {
            interactive: {
                type: 'list_reply',
                list_reply: {
                    id: 'list_123',
                    title: 'Plan Premium',
                    description: 'Detalle',
                },
            },
        })

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect(result?.type).toBe('interactive')
        expect((result as any)?.title_list_reply).toBe('Plan Premium')
        expect((result as any)?.id_list_reply).toBe('list_123')
    })

    test('should prioritize list reply id over title for interactive body', async () => {
        const rawMessage = createMockMessage('interactive', {
            interactive: {
                type: 'list_reply',
                list_reply: {
                    id: 'list_id_priority',
                    title: 'Titulo visible',
                    description: 'Descripcion visible',
                },
            },
        })

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect(result?.body).toBe('list_id_priority')
        expect((result as any)?.title_list_reply).toBe('Titulo visible')
        expect((result as any)?.id_list_reply).toBe('list_id_priority')
    })

    test('should parse interactive nfm_reply response_json and keep raw interactive payload', async () => {
        const rawMessage = createMockMessage('interactive', {
            interactive: {
                type: 'nfm_reply',
                nfm_reply: {
                    name: 'flow_response',
                    response_json: '{"lead_id":"123","status":"ok"}',
                },
            },
        })

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect(result?.type).toBe('interactive')
        expect(result?.body).toBe('{"lead_id":"123","status":"ok"}')
        expect((result as any)?.nfm_reply).toEqual({
            lead_id: '123',
            status: 'ok',
        })
        expect((result as any)?.message?.interactive?.nfm_reply?.response_json).toBe('{"lead_id":"123","status":"ok"}')
    })

    test('should not throw when interactive nfm_reply response_json is invalid', async () => {
        const rawMessage = createMockMessage('interactive', {
            interactive: {
                type: 'nfm_reply',
                nfm_reply: {
                    response_json: '{invalid json',
                },
            },
        })

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect(result).not.toBeNull()
        expect(result?.body).toBe('{invalid json')
        expect((result as any)?.nfm_reply).toBeUndefined()
    })

    test('should keep button/list precedence over nfm_reply body fallback', async () => {
        const rawMessage = createMockMessage('interactive', {
            interactive: {
                type: 'list_reply',
                list_reply: {
                    id: 'list_priority',
                    title: 'Visible title',
                },
                nfm_reply: {
                    response_json: '{"ignored":true}',
                },
            },
        })

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect(result?.body).toBe('list_priority')
        expect((result as any)?.title_list_reply).toBe('Visible title')
        expect((result as any)?.id_list_reply).toBe('list_priority')
        expect((result as any)?.nfm_reply).toEqual({ ignored: true })
    })

    test('should process reaction message correctly', async () => {
        const rawMessage = createMockMessage(
            'reaction',
            {
                reaction: {
                    emoji: '🔥',
                    message_id: 'wamid.123',
                },
            },
            'Unknown',
            '5491155555555'
        )

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect(result?.body).toBe('🔥')
        expect(result?.reactionToMessageId).toBe('wamid.123')
    })

    test('should keep reaction removed event when emoji is missing', async () => {
        const rawMessage = createMockMessage('reaction', {
            reaction: {
                message_id: 'wamid.456',
            },
        })

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect(result?.type).toBe('reaction')
        expect(result?.body).toContain('_event_reaction_removed_')
        expect((result as any)?.reactionEmoji).toBe('')
        expect(result?.reactionToMessageId).toBe('wamid.456')
    })

    test('should process contacts message correctly', async () => {
        const rawMessage = createMockMessage(
            'contacts',
            {
                contacts: [
                    {
                        name: { formatted_name: 'Juan Perez' },
                        phones: [{ phone: '+5491155511122' }],
                    },
                ],
            },
            'Agente',
            '5491155522222'
        )

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect(result?.body).toContain('_event_contacts_')
        expect(result?.contacts).toHaveLength(1)
    })

    test('should process order message correctly', async () => {
        const rawMessage = createMockMessage(
            'order',
            {
                order: {
                    catalog_id: 'catalog_123',
                    product_items: [{ product_retailer_id: 'sku-1', quantity: 2 }],
                },
            },
            'Comprador',
            '5491155533333'
        )

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect(result?.body).toContain('_event_order_')
        expect(result?.order?.catalog_id).toBe('catalog_123')
    })

    test('should return null for unknown message type', async () => {
        const rawMessage = createMockMessage('unsupported_type', {}, 'Unknown', '5491155555555')
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect(result).toBeNull()
        expect(consoleSpy).toHaveBeenCalledWith('[Gupshup] Unhandled message type: unsupported_type')

        consoleSpy.mockRestore()
    })

    test('should include media id when media url is missing', async () => {
        const rawMessage = createMockMessage(
            'image',
            {
                image: {
                    id: 'media-123',
                },
            },
            'Jane',
            '5491155559999'
        )

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect(result?.body).toContain('_event_media_')
        expect(result?.url).toBe('')
        expect(result?.mediaId).toBe('media-123')
    })

    test('should use phone as fallback name if profile name is missing', async () => {
        const rawMessage: GupshupCloudIncomingMessageArgs = {
            metadata: {
                display_phone_number: '15556581240',
            },
            contact: {
                profile: { name: '' },
                wa_id: '5491155553333',
            },
            message: {
                from: '5491155553333',
                id: 'wamid.404',
                timestamp: '1770811963',
                type: 'text',
                text: { body: 'Sin nombre' },
            },
        }

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect(result?.name).toBe('5491155553333')
    })

    test('should return null when sender phone is missing', async () => {
        const rawMessage: GupshupCloudIncomingMessageArgs = {
            message: {
                id: 'wamid.404',
                timestamp: '1770811963',
                type: 'text',
                text: { body: 'Sin telefono' },
            },
        }
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect(result).toBeNull()
        expect(consoleSpy).toHaveBeenCalledWith('[Gupshup] Message without sender phone')

        consoleSpy.mockRestore()
    })

    test('should return null when message type is missing', async () => {
        const rawMessage: GupshupCloudIncomingMessageArgs = {
            metadata: {
                display_phone_number: '15556581240',
            },
            contact: {
                profile: { name: 'John Doe' },
                wa_id: '5491155553333',
            },
            message: {
                from: '5491155553333',
                id: 'wamid.405',
                timestamp: '1770811963',
                type: undefined as any,
                text: { body: 'Sin tipo' },
            },
        }
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

        const result = await processIncomingMessage(rawMessage, mockArgs)

        expect(result).toBeNull()
        expect(consoleSpy).toHaveBeenCalledWith('[Gupshup] Malformed incoming message payload: missing message.type')

        consoleSpy.mockRestore()
    })
})
