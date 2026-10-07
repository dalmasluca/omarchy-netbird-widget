const assert = require('assert')
const fs = require('fs')
const path = require('path')
const Model = require('../netbird-widget/Model.js')

const panelSource = fs.readFileSync(path.join(__dirname, '..', 'netbird-widget', 'Panel.qml'), 'utf8')
const serviceSource = fs.readFileSync(path.join(__dirname, '..', 'netbird-widget', 'Service.qml'), 'utf8')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    console.error(error.stack || error.message || error)
    process.exitCode = 1
  }
}

test('parses connected status and peer details', () => {
  const parsed = Model.parseStatus(JSON.stringify({
    peers: {
      total: 2,
      connected: 1,
      details: [
        { fqdn: 'alpha.example.test', netbirdIp: '100.90.0.10', connectionStatus: 'connected', connectionType: 'P2P' },
        { name: 'beta', ip: '100.90.0.11', status: 'idle' }
      ]
    },
    cliVersion: '0.79.0',
    daemonVersion: '0.79.0',
    daemonStatus: 'Connected',
    management: { url: 'https://vpn.example.test:443', connected: true },
    signal: { url: 'https://signal.example.test', connected: true },
    netbirdIp: '100.90.0.1',
    fqdn: 'host.example.test',
    profileName: 'default'
  }))

  assert.equal(parsed.ok, true)
  assert.equal(parsed.state, 'connected')
  assert.equal(parsed.connected, true)
  assert.equal(parsed.totalPeers, 2)
  assert.equal(parsed.connectedPeers, 1)
  assert.equal(parsed.managementUrl, 'https://vpn.example.test:443')
  assert.deepEqual(parsed.peers.map(peer => peer.name), ['alpha.example.test', 'beta'])
  assert.equal(parsed.peers[0].connected, true)
})

test('parses login-expired status without treating it as malformed', () => {
  const parsed = Model.parseStatus(JSON.stringify({
    peers: { total: 0, connected: 0, details: null },
    daemonStatus: 'NeedsLogin',
    management: {
      url: 'https://vpn.example.test:443',
      connected: false,
      error: 'rpc error: code = PermissionDenied desc = peer login has expired, please log in once more'
    }
  }))

  assert.equal(parsed.ok, true)
  assert.equal(parsed.state, 'needs-login')
  assert.equal(parsed.needsLogin, true)
  assert.equal(parsed.connected, false)
  assert.deepEqual(parsed.peers, [])
})

test('rejects malformed, empty, and structurally invalid status output', () => {
  assert.equal(Model.parseStatus('{nope').ok, false)
  assert.equal(Model.parseStatus('').ok, false)
  assert.equal(Model.parseStatus('{}').ok, false)
  assert.equal(Model.parseStatus('[]').ok, false)
  assert.equal(Model.parseStatus('42').ok, false)
})

test('validates http, https, and bracketed IPv6 management URLs with port and path', () => {
  assert.deepEqual(Model.validateManagementUrl('https://vpn.example.test:443/management'), {
    ok: true,
    url: 'https://vpn.example.test:443/management'
  })
  assert.deepEqual(Model.validateManagementUrl('http://localhost:33073'), {
    ok: true,
    url: 'http://localhost:33073'
  })
  assert.deepEqual(Model.validateManagementUrl('https://[2001:db8::1]:443'), {
    ok: true,
    url: 'https://[2001:db8::1]:443'
  })
  assert.deepEqual(Model.validateManagementUrl('https://[::ffff:192.0.2.1]'), {
    ok: true,
    url: 'https://[::ffff:192.0.2.1]'
  })
  assert.deepEqual(Model.validateManagementUrl('https://[2001:db8:0:0:0:0:192.0.2.1]'), {
    ok: true,
    url: 'https://[2001:db8:0:0:0:0:192.0.2.1]'
  })
})

test('rejects unsafe or unsupported management URLs', () => {
  assert.equal(Model.validateManagementUrl('ftp://vpn.example.test').ok, false)
  assert.equal(Model.validateManagementUrl('https://user:pass@vpn.example.test').ok, false)
  assert.equal(Model.validateManagementUrl('https://vpn.example.test/a b').ok, false)
  assert.equal(Model.validateManagementUrl('https://vpn.example.test:99999').ok, false)
  assert.equal(Model.validateManagementUrl('vpn.example.test:443').ok, false)
  assert.equal(Model.validateManagementUrl('https://[not-ipv6]').ok, false)
  assert.equal(Model.validateManagementUrl('https://[2001:db8::1').ok, false)
  assert.equal(Model.validateManagementUrl('https://vpn.example.test]x').ok, false)
  assert.equal(Model.validateManagementUrl('https://[192.0.2.1::]').ok, false)
  assert.equal(Model.validateManagementUrl('https://[1:192.0.2.1::1]').ok, false)
})

test('builds NetBird commands as argv arrays', () => {
  assert.deepEqual(Model.connectCommand('').command, ['netbird', 'up'])
  assert.deepEqual(Model.cloudConnectCommand().command, ['netbird', 'up', '--management-url', Model.CLOUD_MANAGEMENT_URL])
  assert.deepEqual(Model.connectCommand('https://vpn.example.test:443/api').command, ['netbird', 'up', '--management-url', 'https://vpn.example.test:443/api'])
})

test('self-hosted connect command rejects empty URL while current profile remains allowed', () => {
  assert.equal(Model.connectManagementUrlCommand('').ok, false)
  assert.equal(Model.connectManagementUrlCommand('   ').ok, false)
  assert.deepEqual(Model.connectCommand('').command, ['netbird', 'up'])
  assert.deepEqual(Model.connectManagementUrlCommand('https://vpn.example.test').command, ['netbird', 'up', '--management-url', 'https://vpn.example.test'])
  assert.match(serviceSource, /connectManagementUrl\(url\)[\s\S]*Model\.connectManagementUrlCommand\(url\)/)
})

test('uses the official NetBird mark in the bar and panel with status tint', () => {
  const logoPath = path.join(__dirname, '..', 'netbird-widget', 'assets', 'netbird.svg')
  assert.equal(fs.existsSync(logoPath), true)
  const logo = fs.readFileSync(logoPath, 'utf8')
  assert.match(logo, /<svg[^>]*viewBox="0 0 32 32"/)
  assert.equal((panelSource.match(/NetBirdMark\s*\{/g) || []).length, 2)
  assert.match(panelSource, /import QtQuick\.Effects/)
  assert.match(panelSource, /component NetBirdMark: Item/)
  assert.match(panelSource, /source: Qt\.resolvedUrl\("assets\/netbird\.svg"\)/)
  assert.match(panelSource, /colorizationColor:\s*mark\.tint/)
  assert.match(panelSource, /connected\s*\?\s*root\.foreground\s*:\s*\(needsLogin\s*\?\s*root\.urgent\s*:\s*root\.dim\)/)
})

test('quick actions sit in the hero and self-hosted editor is collapsed by default', () => {
  assert.match(panelSource, /property bool showManagementEditor:\s*false/)
  assert.match(panelSource, /PanelHero\s*\{[\s\S]*?trailingControl:\s*Component\s*\{[\s\S]*?QuickButton/)
  assert.match(panelSource, /QuickButton\s*\{[\s\S]*?visible:\s*!netbird\.connected[\s\S]*?netbird\.connectCurrentProfile\(\)/)
  assert.match(panelSource, /QuickButton\s*\{[\s\S]*?visible:\s*!netbird\.connected[\s\S]*?netbird\.connectCloud\(\)/)
  assert.match(panelSource, /onClicked:\s*root\.showManagementEditor\s*=\s*!root\.showManagementEditor/)
  assert.match(panelSource, /visible:\s*root\.showManagementEditor\s*&&\s*netbird\.installed\s*&&\s*!netbird\.connected/)
  assert.doesNotMatch(panelSource, /text:\s*"ACTIONS"|text:\s*"SELF-HOSTED MANAGEMENT URL"/)
})

test('connection setup buttons are hidden while connected', () => {
  function quickButton(tooltip) {
    const tooltipIndex = panelSource.indexOf(`tooltip: "${tooltip}"`)
    assert.notEqual(tooltipIndex, -1)
    const start = panelSource.lastIndexOf('QuickButton {', tooltipIndex)
    assert.notEqual(start, -1)
    return panelSource.slice(start, panelSource.indexOf('}', tooltipIndex))
  }

  assert.match(quickButton('Connect current profile'), /visible:\s*!netbird\.connected/)
  assert.match(quickButton('Connect to NetBird Cloud'), /visible:\s*!netbird\.connected/)
  assert.match(quickButton('Refresh NetBird status'), /onClicked:\s*netbird\.refresh\(\)/)
  assert.doesNotMatch(quickButton('Refresh NetBird status'), /visible:\s*!netbird\.connected/)
  assert.match(quickButton('Disconnect NetBird'), /onClicked:\s*netbird\.disconnect\(\)/)
  assert.doesNotMatch(quickButton('Disconnect NetBird'), /visible:\s*!netbird\.connected/)

  const selfHostedEditor = panelSource.indexOf('text: "CONNECT TO A SELF-HOSTED SERVER"')
  assert.notEqual(selfHostedEditor, -1)
  const selfHostedColumn = panelSource.lastIndexOf('Column {', selfHostedEditor)
  assert.notEqual(selfHostedColumn, -1)
  assert.match(panelSource.slice(selfHostedColumn, selfHostedEditor), /visible:\s*root\.showManagementEditor\s*&&\s*netbird\.installed\s*&&\s*!netbird\.connected/)
})

test('quick action buttons are square and match the Omarchy hero style', () => {
  const quickButtonStart = panelSource.indexOf('component QuickButton: Rectangle')
  assert.notEqual(quickButtonStart, -1)
  const peerRowStart = panelSource.indexOf('component PeerRow:', quickButtonStart)
  assert.notEqual(peerRowStart, -1)
  const quickButtonSource = panelSource.slice(quickButtonStart, peerRowStart)
  assert.match(quickButtonSource, /implicitWidth:\s*Style\.space\(34\)/)
  assert.match(quickButtonSource, /implicitHeight:\s*implicitWidth/)
  assert.match(quickButtonSource, /PanelToolTip/)
})

test('status poll watchdog restarts per launch and stops on exit', () => {
  const refreshStatusStart = serviceSource.indexOf('function refreshStatus()')
  assert.notEqual(refreshStatusStart, -1)
  const connectCurrentProfileStart = serviceSource.indexOf('function connectCurrentProfile()', refreshStatusStart)
  assert.notEqual(connectCurrentProfileStart, -1)
  const refreshStatusSource = serviceSource.slice(refreshStatusStart, connectCurrentProfileStart)
  const refreshStatusLines = refreshStatusSource.split('\n').map(line => line.trim()).filter(Boolean)
  const launchIndex = refreshStatusLines.indexOf('statusProcess.running = true')
  assert.notEqual(launchIndex, -1)
  assert.equal(refreshStatusLines[launchIndex + 1], 'pollWatchdog.restart()')
  assert.equal(refreshStatusSource.includes('pollWatchdog.start()'), false)
  assert.equal(refreshStatusSource.includes('if (!pollWatchdog.running)'), false)

  const statusProcessStart = serviceSource.indexOf('id: statusProcess')
  assert.notEqual(statusProcessStart, -1)
  const actionProcessStart = serviceSource.indexOf('id: actionProcess', statusProcessStart)
  assert.notEqual(actionProcessStart, -1)
  const statusProcessSource = serviceSource.slice(statusProcessStart, actionProcessStart)
  const onExitedIndex = statusProcessSource.indexOf('onExited: function(exitCode) {')
  assert.notEqual(onExitedIndex, -1)
  const onExitedBodyStart = statusProcessSource.indexOf('{', onExitedIndex) + 1
  const onExitedBody = statusProcessSource.slice(onExitedBodyStart)
  const onExitedLines = onExitedBody.split('\n').map(line => line.trim()).filter(Boolean)
  assert.equal(onExitedLines[0], 'pollWatchdog.stop()')
  assert.equal(onExitedLines[1], 'root.refreshing = false')
  assert(onExitedBody.indexOf('pollWatchdog.stop()') < onExitedBody.indexOf('root.refreshing = false'))
  assert(onExitedBody.indexOf('pollWatchdog.stop()') < onExitedBody.indexOf('if (exitCode === 0)'))
})
