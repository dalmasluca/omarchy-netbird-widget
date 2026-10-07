import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Effects
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

Panel {
  id: root
  moduleName: "local.netbird-widget"
  ipcTarget: "local.netbird-widget"
  manageIpc: false

  property string managementInput: ""
  property bool showManagementEditor: false

  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color urgent: bar ? bar.urgent : Color.urgent
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property string heroMeta: netbird.refreshing ? "Refreshing…" : netbird.statusText
  readonly property string peerSummary: netbird.totalPeers === 0 ? "No peers reported" : (netbird.connectedPeers + " of " + netbird.totalPeers + " peers connected")
  readonly property bool showPeers: netbird.peers.length > 0

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onOpenedChanged: if (opened) netbird.refresh()

  Service {
    id: netbird
    settings: root.settings
    onConnectedChanged: if (connected) root.showManagementEditor = false
  }

  ShellIpc {
    target: root.ipcTarget
    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.toggle() }
    function refresh(): string { netbird.refresh(); return "ok" }
    function status(): string { return netbird.statusText }
    function connect(): string { netbird.connectCurrentProfile(); return "ok" }
    function disconnect(): string { netbird.disconnect(); return "ok" }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    iconComponent: Component {
      Item {
        NetBirdMark {
          anchors.centerIn: parent
          width: Style.font.icon
          height: Style.font.icon
          connected: netbird.connected
          needsLogin: netbird.needsLogin
        }
      }
    }
    onPressed: function(buttonCode) {
      if (buttonCode === Qt.MiddleButton) netbird.refresh()
      else root.toggle()
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(380))
    contentHeight: panel.fittedContentHeight(column.implicitHeight, Style.space(560))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(t) {
        if (t === "r" || t === "R") netbird.refresh()
      }

      Flickable {
        id: panelFlick
        anchors.fill: parent
        contentWidth: width
        contentHeight: column.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        flickableDirection: Flickable.VerticalFlick
        interactive: contentHeight > height
        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

        Column {
          id: column
          width: panelFlick.width
          spacing: Style.space(12)

          PanelHero {
            width: parent.width
            title: "NetBird"
            meta: root.heroMeta
            foreground: root.foreground
            fontFamily: root.fontFamily
            iconComponent: Component {
              NetBirdMark {
                width: Style.font.display
                height: Style.font.display
                connected: netbird.connected
                needsLogin: netbird.needsLogin
              }
            }
            trailingControl: Component {
              Row {
                spacing: Style.space(6)
                visible: netbird.installed

                QuickButton {
                  glyph: "󰑐"
                  tooltip: "Refresh NetBird status"
                  enabled: !netbird.busy
                  onClicked: netbird.refresh()
                }

                QuickButton {
                  visible: !netbird.connected
                  glyph: "󰌘"
                  tooltip: "Connect current profile"
                  enabled: !netbird.busy
                  onClicked: netbird.connectCurrentProfile()
                }

                QuickButton {
                  visible: netbird.connected || netbird.needsLogin || netbird.state === "disconnected"
                  glyph: "󰌙"
                  tooltip: "Disconnect NetBird"
                  enabled: !netbird.busy
                  onClicked: netbird.disconnect()
                }

                QuickButton {
                  visible: !netbird.connected
                  glyph: "󰖩"
                  tooltip: "Connect to NetBird Cloud"
                  enabled: !netbird.busy
                  onClicked: netbird.connectCloud()
                }

                QuickButton {
                  visible: !netbird.connected
                  glyph: "󰒋"
                  tooltip: root.showManagementEditor ? "Close server settings" : "Configure self-hosted server"
                  enabled: !netbird.busy
                  onClicked: root.showManagementEditor = !root.showManagementEditor
                }
              }
            }
          }

          Text {
            textFormat: Text.PlainText
            visible: netbird.actionStatus !== "" || netbird.lastError !== "" || netbird.managementError !== ""
            width: parent.width
            text: netbird.actionStatus !== "" ? netbird.actionStatus : (netbird.lastError !== "" ? netbird.lastError : netbird.managementError)
            color: (netbird.lastError !== "" || netbird.needsLogin) && netbird.actionStatus === "" ? root.urgent : root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.bodySmall
            wrapMode: Text.WordWrap
          }

          CursorSurface {
            visible: !netbird.installed
            width: parent.width
            implicitHeight: missingText.implicitHeight + Style.spacing.rowPaddingX
            foreground: root.foreground

            Text {
              id: missingText
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              anchors.margins: Style.space(12)
              text: "NetBird CLI is not installed or is not on PATH."
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
              wrapMode: Text.WordWrap
            }
          }

          PanelSeparator {
            visible: netbird.installed
            foreground: root.foreground
          }

          Column {
            visible: netbird.installed
            width: parent.width
            spacing: Style.space(8)

            PanelSectionHeader {
              text: "STATUS"
              foreground: root.foreground
              fontFamily: root.fontFamily
            }

            InfoRow { label: "Daemon"; value: netbird.daemonStatus }
            InfoRow { label: "Profile"; value: netbird.profileName !== "" ? netbird.profileName : "default" }
            InfoRow { label: "Management"; value: netbird.managementUrl !== "" ? netbird.managementUrl : "Not reported" }
            InfoRow { label: "Peer summary"; value: root.peerSummary }
            InfoRow { visible: netbird.netbirdIp !== ""; label: "NetBird IP"; value: netbird.netbirdIp }
            InfoRow { visible: netbird.fqdn !== ""; label: "FQDN"; value: netbird.fqdn }
          }

          PanelSeparator {
            visible: root.showManagementEditor && netbird.installed && !netbird.connected
            foreground: root.foreground
          }

          Column {
            visible: root.showManagementEditor && netbird.installed && !netbird.connected
            width: parent.width
            spacing: Style.space(8)

            PanelSectionHeader {
              text: "CONNECT TO A SELF-HOSTED SERVER"
              foreground: root.foreground
              fontFamily: root.fontFamily
            }

            RowLayout {
              width: parent.width
              spacing: Style.space(8)

              TextField {
                id: managementField
                Layout.fillWidth: true
                enabled: !netbird.busy
                text: root.managementInput
                placeholderText: "https://management.example.com:443"
                selectByMouse: true
                foreground: root.foreground
                placeholderTextColor: root.dim
                font.family: root.fontFamily
                onTextChanged: root.managementInput = text
                onAccepted: netbird.connectManagementUrl(text)
              }

              QuickButton {
                glyph: "󰄬"
                tooltip: "Connect to self-hosted server"
                enabled: !netbird.busy
                onClicked: netbird.connectManagementUrl(root.managementInput)
              }
            }

            Text {
              width: parent.width
              text: "Enter a management URL. It is only used for this connection attempt; no credentials are stored."
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              wrapMode: Text.WordWrap
            }
          }

          PanelSeparator {
            visible: netbird.installed
            foreground: root.foreground
          }

          Column {
            visible: netbird.installed
            width: parent.width
            spacing: Style.space(8)

            PanelSectionHeader {
              text: "PEERS"
              foreground: root.foreground
              fontFamily: root.fontFamily
            }

            Text {
              visible: !root.showPeers
              width: parent.width
              text: netbird.connected ? "No peers reported by NetBird." : "Peers are unavailable while NetBird is disconnected or logged out."
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
              horizontalAlignment: Text.AlignHCenter
              wrapMode: Text.WordWrap
            }

            Column {
              visible: root.showPeers
              width: parent.width
              spacing: Style.space(6)

              Repeater {
                model: netbird.peers
                PeerRow {
                  required property var modelData
                  width: parent.width
                  peer: modelData
                }
              }
            }
          }
        }
      }
    }
  }

  component InfoRow: RowLayout {
    property string label: ""
    property string value: ""
    width: parent ? parent.width : 0
    spacing: Style.space(8)

    Text {
      textFormat: Text.PlainText
      text: label
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      Layout.preferredWidth: Style.space(96)
      elide: Text.ElideRight
    }

    Text {
      textFormat: Text.PlainText
      text: value
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      Layout.fillWidth: true
      elide: Text.ElideRight
    }
  }

  component NetBirdMark: Item {
    id: mark
    property bool connected: false
    property bool needsLogin: false
    readonly property color tint: connected ? root.foreground : (needsLogin ? root.urgent : root.dim)

    implicitWidth: Style.font.display
    implicitHeight: implicitWidth

    Image {
      id: logo
      anchors.fill: parent
      source: Qt.resolvedUrl("assets/netbird.svg")
      fillMode: Image.PreserveAspectFit
      smooth: true
      visible: false
    }

    MultiEffect {
      anchors.fill: parent
      source: logo
      colorization: 1.0
      colorizationColor: mark.tint
    }
  }

  component QuickButton: Rectangle {
    id: quickButton
    signal clicked()
    property string glyph: ""
    property string tooltip: ""

    implicitWidth: Style.space(34)
    implicitHeight: implicitWidth
    radius: Style.cornerRadius
    opacity: enabled ? 1.0 : 0.45
    color: Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, quickMouse.containsMouse ? 0.3 : 0.12)
    border.width: quickMouse.containsMouse ? Math.max(1, Style.hoverBorderWidth) : 0
    border.color: Color.accent

    Text {
      anchors.centerIn: parent
      textFormat: Text.PlainText
      text: quickButton.glyph
      color: Color.accent
      font.family: root.fontFamily
      font.pixelSize: Style.font.heading
    }

    MouseArea {
      id: quickMouse
      anchors.fill: parent
      hoverEnabled: true
      enabled: quickButton.enabled
      cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
      onClicked: quickButton.clicked()
    }

    PanelToolTip {
      visible: quickMouse.containsMouse
      text: quickButton.tooltip
    }
  }

  component PeerRow: CursorSurface {
    id: peerRow
    property var peer: null
    readonly property string peerName: peer ? String(peer.name || "Unknown peer") : "Unknown peer"
    readonly property string peerDetail: {
      var parts = []
      if (peer && peer.ip) parts.push(String(peer.ip))
      if (peer && peer.fqdn) parts.push(String(peer.fqdn))
      if (peer && peer.connectionType) parts.push(String(peer.connectionType))
      return parts.join(" · ")
    }

    foreground: root.foreground
    implicitHeight: peerContent.implicitHeight + Style.spacing.rowPaddingX

    RowLayout {
      id: peerContent
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      anchors.leftMargin: Style.space(10)
      anchors.rightMargin: Style.space(10)
      spacing: Style.space(8)

      Text {
        text: peer && peer.connected ? "󰄬" : "󰅖"
        color: peer && peer.connected ? root.foreground : root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.icon
        Layout.alignment: Qt.AlignVCenter
      }

      ColumnLayout {
        Layout.fillWidth: true
        spacing: Style.space(1)

        Text {
          textFormat: Text.PlainText
          Layout.fillWidth: true
          text: peerRow.peerName
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
          elide: Text.ElideRight
        }

        Text {
          textFormat: Text.PlainText
          Layout.fillWidth: true
          text: peerRow.peerDetail !== "" ? peerRow.peerDetail : (peer ? String(peer.status || "") : "")
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
        }
      }

      Text {
        textFormat: Text.PlainText
        text: peer ? String(peer.status || "") : ""
        color: peer && peer.connected ? root.foreground : root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        Layout.alignment: Qt.AlignVCenter
      }
    }
  }
}
