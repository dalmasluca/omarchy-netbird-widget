var CLOUD_MANAGEMENT_URL = "https://api.netbird.io:443"

function cleanText(value) {
  return String(value === undefined || value === null ? "" : value).trim()
}

function firstString(values) {
  for (var i = 0; i < values.length; i++) {
    var value = cleanText(values[i])
    if (value !== "") return value
  }
  return ""
}

function elide(text, max) {
  var value = cleanText(text).replace(/\s+/g, " ")
  var limit = max || 160
  return value.length > limit ? value.substring(0, limit - 1) + "…" : value
}

function isObject(value) {
  return value !== null && typeof value === "object" && typeof value.length !== "number"
}

function valuesFromObject(object) {
  var result = []
  if (!isObject(object)) return result
  for (var key in object) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) continue
    var value = object[key]
    if (isObject(value)) {
      value._id = key
      result.push(value)
    }
  }
  return result
}

function hasAnyField(object, names) {
  if (!isObject(object)) return false
  for (var i = 0; i < names.length; i++) {
    if (Object.prototype.hasOwnProperty.call(object, names[i])) return true
  }
  return false
}

function asArray(value) {
  if (!value) return []
  if (typeof value.length === "number" && typeof value !== "string") return value
  if (isObject(value)) return valuesFromObject(value)
  return []
}

function firstArrayValue(values) {
  for (var i = 0; i < values.length; i++) {
    var list = values[i]
    if (!list || typeof list.length !== "number" || typeof list === "string") continue
    for (var j = 0; j < list.length; j++) {
      var value = cleanText(list[j])
      if (value !== "") return value
    }
  }
  return ""
}

function connectionText(peer) {
  return firstString([
    peer.connectionStatus,
    peer.ConnectionStatus,
    peer.status,
    peer.Status,
    peer.state,
    peer.State
  ])
}

function peerConnected(peer, statusText) {
  if (peer.connected === true || peer.Connected === true || peer.online === true || peer.Online === true) return true
  var status = cleanText(statusText).toLowerCase()
  if (status === "connected") return true
  if (status.indexOf("connected") !== -1 && status.indexOf("disconnected") === -1) return true
  return false
}

function normalizePeer(rawPeer, index) {
  var peer = rawPeer || {}
  var fqdn = firstString([peer.fqdn, peer.FQDN, peer.dnsName, peer.DNSName, peer.dns, peer.DNS])
  var name = firstString([peer.name, peer.Name, peer.hostname, peer.Hostname, peer.hostName, peer.HostName, fqdn])
  var ip = firstString([
    peer.netbirdIp,
    peer.netbirdIP,
    peer.NetBirdIP,
    peer.ip,
    peer.IP,
    peer.address,
    peer.Address,
    firstArrayValue([peer.netbirdIps, peer.netbirdIPs, peer.ips, peer.IPs, peer.allowedIps, peer.AllowedIPs])
  ])
  var status = connectionText(peer)
  var connected = peerConnected(peer, status)

  return {
    id: firstString([peer.id, peer.ID, peer.publicKey, peer.PublicKey, peer._id, String(index)]),
    name: name || ip || "Unknown peer",
    fqdn: fqdn,
    ip: ip,
    status: status || (connected ? "Connected" : "Disconnected"),
    connected: connected,
    connectionType: firstString([peer.connectionType, peer.ConnectionType, peer.relayed ? "Relayed" : ""]),
    lastSeen: firstString([peer.lastSeen, peer.LastSeen, peer.lastStatusUpdate, peer.LastStatusUpdate])
  }
}

function parsePeers(peersObject) {
  var details = []
  if (peersObject && peersObject.details !== undefined) details = asArray(peersObject.details)
  else details = asArray(peersObject)

  var peers = []
  for (var i = 0; i < details.length; i++) peers.push(normalizePeer(details[i], i))
  peers.sort(function(a, b) { return String(a.name).localeCompare(String(b.name)) })
  return peers
}

function parseStatus(raw) {
  var text = cleanText(raw)
  if (text === "") {
    return { ok: false, message: "No status output", error: "NetBird status returned no JSON" }
  }

  try {
    var data = JSON.parse(text)
    if (!isObject(data)) return { ok: false, message: "Malformed status", error: "NetBird status JSON root must be an object" }
    if (!hasAnyField(data, ["peers", "Peers"]) || !hasAnyField(data, ["daemonStatus", "DaemonStatus", "status", "Status", "backendState", "BackendState"])) {
      return { ok: false, message: "Malformed status", error: "NetBird status JSON is missing required fields" }
    }

    var peersContainer = data.peers || data.Peers || {}
    var peers = parsePeers(peersContainer)
    var management = data.management || data.Management || {}
    var signal = data.signal || data.Signal || {}
    var daemonStatus = firstString([data.daemonStatus, data.DaemonStatus, data.status, data.Status, data.backendState, data.BackendState])
    var daemonLower = daemonStatus.toLowerCase()
    var managementError = firstString([management.error, management.Error])
    var connected = daemonLower === "connected" || daemonLower === "running" || daemonLower === "up" || management.connected === true || management.Connected === true
    var needsLogin = daemonLower === "needslogin" || daemonLower === "needs login" || daemonLower === "loginrequired" || daemonLower === "login required"
    if (!needsLogin && /login.*expired|expired.*login|permissiondenied|permission denied/i.test(managementError)) needsLogin = true
    if (needsLogin) connected = false

    var totalPeers = 0
    if (peersContainer && typeof peersContainer.total === "number") totalPeers = peersContainer.total
    else if (peersContainer && typeof peersContainer.Total === "number") totalPeers = peersContainer.Total
    else totalPeers = peers.length

    var connectedPeers = 0
    if (peersContainer && typeof peersContainer.connected === "number") connectedPeers = peersContainer.connected
    else if (peersContainer && typeof peersContainer.Connected === "number") connectedPeers = peersContainer.Connected
    else {
      for (var i = 0; i < peers.length; i++) if (peers[i].connected) connectedPeers++
    }

    var state = needsLogin ? "needs-login" : (connected ? "connected" : "disconnected")
    var statusText = needsLogin ? "Needs login" : (connected ? "Connected" : (daemonStatus || "Disconnected"))
    return {
      ok: true,
      state: state,
      connected: connected,
      needsLogin: needsLogin,
      daemonStatus: daemonStatus || "Unknown",
      statusText: statusText,
      peers: peers,
      totalPeers: totalPeers,
      connectedPeers: connectedPeers,
      managementUrl: firstString([management.url, management.URL]),
      managementConnected: management.connected === true || management.Connected === true,
      managementError: managementError,
      signalUrl: firstString([signal.url, signal.URL]),
      signalConnected: signal.connected === true || signal.Connected === true,
      cliVersion: firstString([data.cliVersion, data.CLIVersion]),
      daemonVersion: firstString([data.daemonVersion, data.DaemonVersion]),
      netbirdIp: firstString([data.netbirdIp, data.netbirdIP, data.NetBirdIP]),
      fqdn: firstString([data.fqdn, data.FQDN]),
      profileName: firstString([data.profileName, data.ProfileName])
    }
  } catch (e) {
    return { ok: false, message: "Malformed status", error: "Failed to parse NetBird status JSON" }
  }
}

function isValidIpv4(host) {
  var parts = String(host || "").split(".")
  if (parts.length !== 4) return false
  for (var i = 0; i < parts.length; i++) {
    if (!/^[0-9]{1,3}$/.test(parts[i])) return false
    var n = parseInt(parts[i], 10)
    if (n < 0 || n > 255) return false
    if (String(n) !== parts[i] && !/^0$/.test(parts[i])) return false
  }
  return true
}

function ipv6HextetCount(segment) {
  if (segment === "") return 0
  var parts = segment.split(":")
  var count = 0
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i]
    if (part === "") return -1
    if (part.indexOf(".") !== -1) {
      if (i !== parts.length - 1 || !isValidIpv4(part)) return -1
      count += 2
    } else {
      if (!/^[0-9A-Fa-f]{1,4}$/.test(part)) return -1
      count += 1
    }
  }
  return count
}

function isValidIpv6(host) {
  var value = String(host || "")
  if (value === "" || /[^0-9A-Fa-f:.]/.test(value)) return false
  var doubleColon = value.indexOf("::")
  if (doubleColon !== -1 && value.indexOf("::", doubleColon + 2) !== -1) return false

  if (doubleColon === -1) return ipv6HextetCount(value) === 8

  var sides = value.split("::")
  if (sides[0].indexOf(".") !== -1) return false
  var left = ipv6HextetCount(sides[0])
  var right = ipv6HextetCount(sides[1])
  if (left < 0 || right < 0) return false
  return left + right < 8
}

function validateManagementUrl(input) {
  var value = cleanText(input)
  if (value === "") return { ok: false, error: "Enter a management URL." }
  if (/[\u0000-\u001f\u007f\s]/.test(value)) return { ok: false, error: "Management URL cannot contain whitespace." }
  if (value.indexOf("#") !== -1) return { ok: false, error: "Management URL cannot contain a fragment." }
  if (value.indexOf("?") !== -1) return { ok: false, error: "Management URL cannot contain a query string." }

  var match = value.match(/^(https?):\/\/([^/]+)(\/.*)?$/i)
  if (!match) return { ok: false, error: "Management URL must start with http:// or https:// and include a host." }
  var scheme = match[1].toLowerCase()
  var authority = match[2]
  var path = match[3] || ""
  if (scheme !== "http" && scheme !== "https") return { ok: false, error: "Management URL must use http:// or https://." }
  if (authority === "" || authority.indexOf("@") !== -1) return { ok: false, error: "Management URL must include a host and no credentials." }

  var host = authority
  var port = ""
  if (authority.charAt(0) === "[") {
    var close = authority.indexOf("]")
    if (close < 0) return { ok: false, error: "IPv6 management URL host must be bracketed." }
    host = authority.substring(1, close)
    if (!isValidIpv6(host)) return { ok: false, error: "IPv6 management URL host is invalid." }
    if (authority.length > close + 1) {
      if (authority.charAt(close + 1) !== ":") return { ok: false, error: "Invalid management URL host." }
      port = authority.substring(close + 2)
    }
  } else if (authority.indexOf(":") !== -1) {
    var parts = authority.split(":")
    if (parts.length !== 2) return { ok: false, error: "IPv6 management URL host must be bracketed." }
    host = parts[0]
    port = parts[1]
  }

  if (cleanText(host) === "") return { ok: false, error: "Management URL must include a host." }
  if (/[\\[\]]/.test(host) || host === "." || host === "..") return { ok: false, error: "Invalid management URL host." }
  if (port !== "" && !/^[0-9]{1,5}$/.test(port)) return { ok: false, error: "Management URL port must be numeric." }
  if (port !== "") {
    var n = parseInt(port, 10)
    if (n < 1 || n > 65535) return { ok: false, error: "Management URL port must be between 1 and 65535." }
  }

  return { ok: true, url: scheme + "://" + authority + path }
}

function connectCommand(managementUrl) {
  var url = cleanText(managementUrl)
  if (url === "") return { ok: true, command: ["netbird", "up"] }
  var validation = validateManagementUrl(url)
  if (!validation.ok) return validation
  return { ok: true, command: ["netbird", "up", "--management-url", validation.url] }
}

function connectManagementUrlCommand(managementUrl) {
  var validation = validateManagementUrl(managementUrl)
  if (!validation.ok) return validation
  return { ok: true, command: ["netbird", "up", "--management-url", validation.url] }
}

function cloudConnectCommand() {
  return connectManagementUrlCommand(CLOUD_MANAGEMENT_URL)
}

if (typeof module !== "undefined") {
  module.exports = {
    CLOUD_MANAGEMENT_URL: CLOUD_MANAGEMENT_URL,
    cleanText: cleanText,
    elide: elide,
    parseStatus: parseStatus,
    validateManagementUrl: validateManagementUrl,
    connectCommand: connectCommand,
    connectManagementUrlCommand: connectManagementUrlCommand,
    cloudConnectCommand: cloudConnectCommand,
    normalizePeer: normalizePeer
  }
}
