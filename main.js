const { app, BrowserWindow, ipcMain } = require("electron");
const Shortcut = require("electron-shortcut");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const url = require("url");
const fs = require("fs");
const { SerialPort } = require("serialport");
const net = require("net");
var nrc = require("node-run-cmd");

class AppFiles {
  static kantarConfigs = `kantarConfigs.json`;
  static kantarName = "C:\\HybsKantarName.json";
  static tempTxt = "fis/template.txt";
  static outTxt = "fis/output.txt";
  static exePath = "fis/PrintFis.exe";
}

var antenTcp;
let mainWindow;
var args = process.argv;
const configJsonFile = JSON.parse(fs.readFileSync(AppFiles.kantarConfigs));
const kantarName = JSON.parse(fs.readFileSync(AppFiles.kantarName)).kantarName;

if (kantarName == "" || kantarName == undefined)
  throw new Error("(HybsKantarName.json) KANTAR ADI BULUNAMADI!");

const config = configJsonFile[kantarName];
if (config == undefined) throw new Error("KANTAR KONFİGÜRASYONU BULUNAMADI!");
if (config.kantarId == undefined) throw new Error("KANTAR ID BULUNAMADI!");

function onReady() {
  mainWindow = new BrowserWindow({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, "preload.js"),
    },
    icon: path.join(__dirname, "assets/icon.ico"),
  });
  mainWindow.setMenu(null);
  mainWindow.setTitle("Izmir Kantar v" + app.getVersion());

  new Shortcut("Ctrl+F12", function (e) {
    mainWindow.webContents.openDevTools();
  });

  //Serialport
  if (config.kantar) {
    const port = new SerialPort(config.serialPort);

    port.open(function (err) {
      if (err) {
        console.log("Error opening port: " + err.messages);
        return printToAngular("Error opening port: ", err.message);
      }
    });

    port.on("error", function (err) {
      console.log("Error: " + err.messages);
      printToAngular("Error: ", err.message);
    });

    var currMessage = "";
    var messages = [];
    port.on("data", function (data) {
      currMessage += Buffer.from(data).toString();

      console.log("String Data =>" + currMessage);
      printToAngular("String Data =>" + currMessage);

      if (currMessage.length > 50) {
        currMessage = "";
        return;
      }

      if (!currMessage.endsWith("\\r") && !currMessage.endsWith("\r")) return;

      currMessage = currMessage.replaceAll("\\r", "").replaceAll("\r", "");

      currMessage = dataParser(currMessage); //parse kantar data

      messages.push(currMessage);

      if (messages.length == 5) {
        let allSame = [...new Set(messages)].length == 1;
        if (allSame) {
          mainWindow.webContents.send("kantar", [messages[0]]);
          console.log("Data sended => " + messages[0]);
          messages = [];
        } else {
          messages = messages.slice(1);
        }
      }
      currMessage = "";
    });
  }
  mainWindow.maximize();

  if (args.includes("serve")) {
    mainWindow.loadURL("http://localhost:4200");
  } else {
    mainWindow.loadURL(`file://${__dirname}/out/kantar_electron/index.html`);
  }

  var server = net.createServer();
  server.on("connection", handleConnection);

  server.listen(5555, function () {
    console.log("server listening to %j", server.address());
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates();
    mainWindow.webContents.send("KantarId", config.kantarId);
    mainWindow.webContents.send("KantarAdi", config.kantarAdi);
    mainWindow.webContents.send("DepolamaAlanId", config.depolamaAlanId);
  }, 4000);
}

function dataParser(msg) {
  if (config.kantarMarka == "tartanTarim") {
    return msg.split(" ")[0].replaceAll("WN", "").replaceAll("-", "");
  } else if (config.kantarMarka == "netKantar") {
    return msg.replaceAll("=", "").replaceAll("(kg)", "");
  } else if (config.kantarMarka == "ideKantar") {
    return msg.replaceAll("A", "").replaceAll(" ", "");
  }
}

app.on("window-all-closed", function () {
  app.quit();
});

app.on("ready", onReady);

app.on("activate", function () {
  if (mainWindow === null) onReady();
});

ipcMain.on("restart_update", () => {
  autoUpdater.quitAndInstall();
});

ipcMain.on("onprint", async (event, data) => {
  if (!config.isPrinterOn) return;
  try {
    printToAngular("ONPRİNT");
    data = data[0];
    if (data.IslemTarihi != null)
      data.IslemTarihi = moment(data.IslemTarihi).format("DD.MM.yyyy HH:mm");
    else data.IslemTarihi = "";

    printToAngular(data);
    var fisTxt = fs.readFileSync(AppFiles.tempTxt, "utf-8");
    for (const [key, value] of Object.entries(data))
      fisTxt = fisTxt.replaceAll(`{{${key}}}`, value ?? "");

    fs.writeFile(AppFiles.outTxt, fisTxt, (err, res) => {
      if (err) {
        printToAngular(err);
        return;
      }
      const command =
        AppFiles.exePath + `"${config.printerName}" "${AppFiles.outTxt}"`;

      nrc.run(command).then(
        function (exitCodes) {
          printToAngular("printed  " + exitCodes);
        },
        function (err) {
          printToAngular("Command failed to run with error: " + err);
        }
      );
    });
  } catch (error) {
    printToAngular(error);
  }
});

autoUpdater.on("update-available", () => {
  mainWindow.webContents.send("update_available");
  printToAngular("update_available");
});

autoUpdater.on("download-progress", (progressObj) => {
  let log_message = "Hız: " + progressObj.bytesPerSecond;
  log_message = log_message + " - İndirilen " + progressObj.percent + "%";
  mainWindow.webContents.send("download_progress", {
    text: log_message,
    data: progressObj,
  });
  printToAngular(log_message);
});

autoUpdater.on("update-downloaded", () => {
  printToAngular("update-downloaded");
  mainWindow.webContents.send("update_downloaded");
});

autoUpdater.on("error", (message) => {
  printToAngular(message);
});

function printToAngular(message) {
  mainWindow.webContents.send("print", message);
}

function handleConnection(conn) {
  antenTcp = conn;
  var remoteAddress = conn.remoteAddress + ":" + conn.remotePort;
  console.log("new client connection from %s", remoteAddress);
  conn.on("data", onConnData);
  conn.once("close", onConnClose);
  conn.on("error", onConnError);

  var tcpmessages = [];
  function onConnData(d) {
    try {
      var arr = [];

      for (let i = 0; i < d.length; i++) arr.push("0x" + d[i].toString(16));

      for (var i = 0; i < arr.length - 4; i++) {
        if (arr[i] == 0x13) {
          if (arr.Length < i + 3) return;
          var hex1 = byteToHex(arr[i + 1]);
          var hex2 = byteToHex(arr[i + 2]);
          var hex3 = byteToHex(arr[i + 3]);

          var data = parseInt(hex1 + hex2 + hex3, 16);
          tcpmessages.push(data);

          if (tcpmessages.length == 10) {
            let allSame = [...new Set(tcpmessages)].length == 1;
            if (allSame) {
              mainWindow.webContents.send("tcp", tcpmessages[0].toString());
              console.log(data);
              tcpmessages = [];
            } else {
              tcpmessages = tcpmessages.slice(1);
            }
          }
        }
      }
    } catch (error) {
      console.log("on connection data error : " + error);
    }
  }
  function byteToHex(byte) {
    const unsignedByte = byte & 0xff;
    if (unsignedByte < 16) {
      return "0" + unsignedByte.toString(16);
    } else {
      return unsignedByte.toString(16);
    }
  }

  function onConnClose() {
    console.log("connection from %s closed", remoteAddress);
  }

  function onConnError(err) {
    console.log("Connection %s error: %s", remoteAddress, err.message);
  }
}

ipcMain.on("bariyer", (event) => {
  if (antenTcp) {
    antenTcp.write("0100000111040D12CA\r");
    mainWindow.webContents.send("basarili", "Çıkış bariyeri açıldı.");
  }
});
