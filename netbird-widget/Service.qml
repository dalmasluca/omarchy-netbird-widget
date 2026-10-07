import QtQuick
import Quickshell
import Quickshell.Io
import "Model.js" as Model

Item {
  id: root

  property var settings: ({})

  property bool installed: false
  property bool refreshing: false
  property string state: "checking"
  property bool connected: false
  property bool needsLogin: false
  property string statusText: "Checking…"
  property string daemonStatus: "Unknown"
  property string profileName: ""
  property string managementUrl: ""
  property bool managementConnected: false
  property string managementError: ""
  property string signalUrl: ""
  property bool signalConnected: false
  property string cliVersion: ""
  property string daemonVersion: ""
  property string netbirdIp: ""
  property string fqdn: ""
  property var peers: []
  property int totalPeers: 0
  property int connectedPeers: 0
  property string actionStatus: ""
  property string lastError: ""

  property string _statusOutput: ""
  property string _statusError: ""
  property string _actionOutput: ""
  property string _actionError: ""
  property string _pendingAction: ""

  readonly property int refreshIntervalSec: intSetting("refreshIntervalSec", 30, 5, 3600)
  readonly property bool busy: whichProcess.running || statusProcess.running || actionProcess.running

  function setting(name, fallback) {
    var value = settings ? settings[name] : undefined
    return value === undefined || value === null ? fallback : value
  }

  function intSetting(name, fallback, min, max) {
    var n = parseInt(String(setting(name, fallback)), 10)
    if (!isFinite(n)) n = fallback
    if (n < min) n = min
    if (n > max) n = max
    return n
  }

  function elideStatus(text) {
    return Model.elide(text, 180)
  }

  function resetUnavailable(message) {
    state = "unavailable"
    connected = false
    needsLogin = false
    statusText = message || "Unavailable"
    daemonStatus = "Unavailable"
    profileName = ""
    managementUrl = ""
    managementConnected = false
    managementError = ""
    signalUrl = ""
    signalConnected = false
    cliVersion = ""
    daemonVersion = ""
    netbirdIp = ""
    fqdn = ""
    peers = []
    totalPeers = 0
    connectedPeers = 0
  }

  function applyStatus(parsed) {
    if (!parsed.ok) {
      resetUnavailable(parsed.message || "Status error")
      lastError = parsed.error || "Could not read NetBird status"
      console.warn("netbird-widget", lastError)
      return
    }

    state = parsed.state
    connected = parsed.connected
    needsLogin = parsed.needsLogin
    statusText = parsed.statusText
    daemonStatus = parsed.daemonStatus
    profileName = parsed.profileName
    managementUrl = parsed.managementUrl
    managementConnected = parsed.managementConnected
    managementError = parsed.managementError
    signalUrl = parsed.signalUrl
    signalConnected = parsed.signalConnected
    cliVersion = parsed.cliVersion
    daemonVersion = parsed.daemonVersion
    netbirdIp = parsed.netbirdIp
    fqdn = parsed.fqdn
    peers = parsed.peers
    totalPeers = parsed.totalPeers
    connectedPeers = parsed.connectedPeers
    lastError = ""
  }

  function refresh() {
    if (installed) {
      refreshStatus()
      return
    }
    if (!whichProcess.running) {
      refreshing = true
      whichProcess.command = ["which", "netbird"]
      whichProcess.running = true
    }
  }

  function refreshStatus() {
    if (!installed || statusProcess.running) return
    _statusOutput = ""
    _statusError = ""
    refreshing = true
    statusProcess.command = ["netbird", "status", "--json"]
    statusProcess.running = true
    pollWatchdog.restart()
  }

  function connectCurrentProfile() {
    runAction(Model.connectCommand(""), "Connecting with current NetBird profile…", "connect")
  }

  function connectCloud() {
    runAction(Model.cloudConnectCommand(), "Connecting to NetBird Cloud…", "connect")
  }

  function connectManagementUrl(url) {
    runAction(Model.connectManagementUrlCommand(url), "Connecting to NetBird management URL…", "connect")
  }

  function disconnect() {
    runAction({ ok: true, command: ["netbird", "down"] }, "Disconnecting NetBird…", "disconnect")
  }

  function runAction(plan, label, pendingAction) {
    if (!installed) return
    if (actionProcess.running) return
    if (!plan || !plan.ok) {
      lastError = plan && plan.error ? plan.error : "Invalid NetBird command"
      actionStatus = lastError
      actionStatusTimer.restart()
      return
    }
    _actionOutput = ""
    _actionError = ""
    _pendingAction = pendingAction || ""
    actionStatus = label || ""
    lastError = ""
    actionProcess.command = plan.command
    actionProcess.running = true
  }

  Timer {
    id: refreshTimer
    interval: root.refreshIntervalSec * 1000
    repeat: true
    running: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  Timer {
    id: delayedRefresh
    interval: 700
    repeat: false
    onTriggered: root.refresh()
  }

  Timer {
    id: pollWatchdog
    interval: 15000
    repeat: false
    onTriggered: {
      if (statusProcess.running) statusProcess.running = false
      root.refreshing = false
    }
  }

  Timer {
    id: actionStatusTimer
    interval: 2600
    repeat: false
    onTriggered: root.actionStatus = ""
  }

  Process {
    id: whichProcess
    running: false
    command: []
    onExited: function(exitCode) {
      root.installed = exitCode === 0
      if (root.installed) root.refreshStatus()
      else {
        root.refreshing = false
        root.resetUnavailable("NetBird CLI is not installed")
        root.lastError = ""
      }
    }
  }

  Process {
    id: statusProcess
    running: false
    command: []
    stdout: StdioCollector { id: statusStdout; waitForEnd: true; onStreamFinished: root._statusOutput = text }
    stderr: StdioCollector { id: statusStderr; waitForEnd: true; onStreamFinished: root._statusError = text }
    onExited: function(exitCode) {
      pollWatchdog.stop()
      root.refreshing = false
      var stdout = String(statusStdout.text || root._statusOutput || "")
      var stderr = String(statusStderr.text || root._statusError || "")
      if (exitCode === 0) root.applyStatus(Model.parseStatus(stdout))
      else {
        root.resetUnavailable("NetBird daemon unavailable")
        root.lastError = root.elideStatus(stderr || stdout || "netbird status --json failed")
      }
    }
  }

  Process {
    id: actionProcess
    running: false
    command: []
    stdout: StdioCollector { id: actionStdout; waitForEnd: true; onStreamFinished: root._actionOutput = text }
    stderr: StdioCollector { id: actionStderr; waitForEnd: true; onStreamFinished: root._actionError = text }
    onExited: function(exitCode) {
      var stdout = String(actionStdout.text || root._actionOutput || "")
      var stderr = String(actionStderr.text || root._actionError || "")
      if (exitCode !== 0) {
        root.lastError = root.elideStatus(stderr || stdout || "NetBird command failed")
        root.actionStatus = root.lastError
      } else {
        root.lastError = ""
        root.actionStatus = ""
      }
      root._pendingAction = ""
      actionStatusTimer.restart()
      delayedRefresh.restart()
    }
  }
}
