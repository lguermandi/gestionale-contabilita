import { afterEach, describe, expect, it, vi } from 'vitest'
import { chooseGoogleDriveDestination, createWorkspaceDriveFolder, shareWorkspaceFolderWithBackend } from './googleDrivePicker'

describe('Google Drive workspace setup', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports missing Google Cloud configuration before starting OAuth', async () => {
    await expect(chooseGoogleDriveDestination()).rejects.toThrow('Selettore Google Drive non configurato')
  })

  it('creates a workspace folder under the selected parent and shares only that folder with GAS', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'workspace-folder-id',
        name: 'Gestionale contabile',
        webViewLink: 'https://drive.google.com/drive/folders/workspace-folder-id',
      }), { headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ permissions: [] }), {
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'permission-id' }), {
        headers: { 'Content-Type': 'application/json' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    const folder = await createWorkspaceDriveFolder('google-access-token', 'chosen-parent-id', 'Gestionale contabile')
    await shareWorkspaceFolderWithBackend('google-access-token', folder.id, 'gas-owner@example.com')

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      name: 'Gestionale contabile',
      parents: ['chosen-parent-id'],
    })
    expect(fetchMock.mock.calls[1][0]).toContain('/workspace-folder-id/permissions')
    expect(fetchMock.mock.calls[2][0]).toContain('/workspace-folder-id/permissions')
    expect(fetchMock.mock.calls[2][0]).not.toContain('chosen-parent-id')
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toMatchObject({
      type: 'user',
      role: 'writer',
      emailAddress: 'gas-owner@example.com',
    })
  })
})
