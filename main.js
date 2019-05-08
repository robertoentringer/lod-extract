#! /usr/bin/env node

const flow = require("xml-flow")
const https = require("https")
const path = require("path")
const tar = require("tar")
const fs = require("fs")

const api = "https://data.public.lu/api/1/datasets/letzebuerger-online-dictionnaire-raw-data/"

const regex = /\.xml$/
const infos = { noAudio: [], smallFiles: [], writeFail: [], countAudio: 0, countJson: 0 }
const hrstart = process.hrtime()

let audioFolder, jsonFolder

const getURLfromAPI = () => {
  return new Promise((resolve, reject) => {
    https
      .get(api, resp => {
        if (resp.statusCode !== 200)
          return reject(new Error(resp.statusCode + " : " + resp.statusMessage))
        let body = ""
        resp.on("data", data => (body += data))
        resp.on("end", () => {
          try {
            body = JSON.parse(body)
          } catch (err) {
            reject(err)
          }
          let [resources] = body.resources || []
          if (resources && "url" in resources) resolve(resources.url)
          else reject(new Error("URL ressource not found"))
        })
      })
      .on("error", err => reject(err))
  })
}

const createFolders = (distFolder = "dist") => {
  distFolder = path.join(process.cwd(), distFolder)
  audioFolder = path.join(distFolder, "audio")
  jsonFolder = path.join(distFolder, "json")
  const folders = [distFolder, audioFolder, jsonFolder]
  for (const folder of folders)
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true })
}

const extract = url =>
  https.get(url, resp => {
    console.info(`Extracting from : ${url}`, "\n")
    resp.pipe(tar.t()).on("entry", entry => {
      if (regex.test(entry.path)) parse(entry)
    })
  })

const parse = entry => {
  console.info(`Parsing from : ${entry.path}`, "\n")
  return flow(entry)
    .on("tag:lod:item", item => {
      const id = item["lod:meta"]["lod:id"]
      printProgress(id)
      if ("lod:audio" in item && "$text" in item["lod:audio"]) {
        const audio = item["lod:audio"]["$text"]
        writeAudio(id, audio)
      } else infos.noAudio.push(id)
      delete item["lod:audio"]
      writeJson(id, item)
    })
    .on("error", err => console.error(err))
    .on("end", feedBack)
}

const writeJson = (id, item) => {
  const filename = `${id}.json`
  const jsonPath = path.join(jsonFolder, filename)
  try {
    fs.writeFileSync(jsonPath, JSON.stringify(item, null, 2))
    infos.countJson++
  } catch (err) {
    infos.writeFail.push(filename)
  }
}

const writeAudio = (id, data) => {
  const filename = `${id}.mp3`
  const audioPath = path.join(audioFolder, filename)
  const buff = new Buffer.from(data, "base64")
  if (buff.length < 1000) infos.smallFiles.push(id)
  try {
    fs.writeFileSync(audioPath, buff)
    infos.countAudio++
  } catch (err) {
    infos.writeFail.push(filename)
  }
}

const printProgress = progress => {
  process.stdout.clearLine()
  process.stdout.cursorTo(0)
  process.stdout.write(progress)
}

const feedBack = () => {
  const hrend = process.hrtime(hrstart)
  const time = new Date(hrend[0] * 1000).toISOString().substr(11, 8)
  process.stdout.cursorTo(0)
  process.stdout.clearLine()
  console.info("⦿ Execution time : %s", time)
  console.info("√ Json files : %s", infos.countJson)
  console.info("√ Mp3 files : %s", infos.countAudio)
  console.info("☓ Items without audio : ", infos.noAudio.length, infos.noAudio)
  console.info("⁈ Files very small : ", infos.smallFiles.length, infos.smallFiles, "\n")
  process.exit()
}

const main = () => {
  process.on("SIGINT", feedBack)
  getURLfromAPI()
    .then(url => {
      createFolders(path.basename(url).replace(".tar.gz", ""))
      extract(url)
    })
    .catch(console.error)
}

main()
