import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRng } from './demo/rng'
import { generateDayModels } from './demo/model'
import { populate } from './demo/populate'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SEED = 20260101
const NUM_DAYS = 450
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'demo-data')

// Fixed "latest sync" date so the demo always looks recently updated.
const END_DATE = new Date('2026-10-10T00:00:00')
const START_DATE = new Date(END_DATE)
START_DATE.setDate(START_DATE.getDate() - (NUM_DAYS - 1))

function main() {
  console.log(`Generating ${NUM_DAYS} days of demo GarminDB data (${START_DATE.toISOString().slice(0, 10)} → ${END_DATE.toISOString().slice(0, 10)})…`)
  const rng = createRng(SEED)
  const days = generateDayModels(rng, START_DATE, NUM_DAYS)
  const totalActivities = days.reduce((s: number, d) => s + d.activities.length, 0)
  console.log(`Planned ${totalActivities} activities across ${NUM_DAYS} days.`)

  populate(OUTPUT_DIR, days, rng)

  console.log(`Demo data written to ${OUTPUT_DIR}`)
}

main()
