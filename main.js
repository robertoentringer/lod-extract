#! /usr/bin/env node

const flow = require('xml-flow')
const https = require('https')
const path = require('path')
const tar = require('tar')
const fs = require('fs')

const api =
  process.argv.slice(2).shift() ||
  'https://data.public.lu/api/1/datasets/letzebuerger-online-dictionnaire/'

const regex = /\.xml$/
const infos = { writeFail: [], countJson: 0 }
const hrstart = process.hrtime()

let jsonFolder

const getURLfromAPI = () => {
  return new Promise((resolve, reject) => {
    https
      .get(api, (resp) => {
        if (resp.statusCode !== 200)
          return reject(new Error(resp.statusCode + ' : ' + resp.statusMessage))
        let body = ''
        resp.on('data', (data) => (body += data))
        resp.on('end', () => {
          try {
            body = JSON.parse(body)
          } catch (err) {
            reject(err)
          }
          let [resources] = body.resources || []
          if (resources && 'url' in resources) resolve(resources.url)
          else reject(new Error('URL ressource not found'))
        })
      })
      .on('error', (err) => reject(err))
  })
}

const createFolders = (distFolder = 'dist') => {
  distFolder = path.join(process.cwd(), distFolder)
  jsonFolder = path.join(distFolder, 'json')
  const folders = [distFolder, jsonFolder]
  for (const folder of folders)
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true })
}

const extract = (url) =>
  https.get(url, (resp) => {
    console.info(`Extracting from : ${url}`, '\n')
    resp.pipe(tar.t()).on('entry', (entry) => {
      if (regex.test(entry.path)) parse(entry)
    })
  })

const parse = (entry) => {
  console.info(`Parsing from : ${entry.path}`, '\n')
  return flow(entry)
    .on('tag:lod:item', (item) => {
      const id = item['lod:meta']['lod:id']
      printProgress(id)
      writeJson(id, item)
    })
    .on('error', (err) => console.error(err))
    .on('end', feedBack)
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

const printProgress = (progress) => {
  process.stdout.clearLine()
  process.stdout.cursorTo(0)
  process.stdout.write(progress)
}

const feedBack = () => {
  const hrend = process.hrtime(hrstart)
  const time = new Date(hrend[0] * 1000).toISOString().substr(11, 8)
  process.stdout.cursorTo(0)
  process.stdout.clearLine()
  console.info('⦿ Execution time : %s', time)
  console.info('√ Json files : %s', infos.countJson, '\n')
  process.exit()
}

const main = () => {
  process.on('SIGINT', feedBack)
  getURLfromAPI()
    .then((url) => {
      createFolders(path.basename(url).replace('.tar.gz', ''))
      extract(url)
    })
    .catch(console.error)
}

main()
