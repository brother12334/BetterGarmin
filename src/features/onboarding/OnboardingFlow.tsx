import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { CopyField } from './CopyField'
import { DropZone } from './DropZone'
import { SparkleIcon } from '../../app/icons'
import { useData } from '../../app/DataProvider'

type Step = 'welcome' | 'guide' | 'demo-loading'

const STEPS = [
  {
    title: '1. Install GarminDB',
    body: 'GarminDB is a free, open-source tool that downloads your Garmin Connect data onto your own computer. Run this once in a terminal:',
    command: 'pip install garmindb',
  },
  {
    title: '2. Add your Garmin Connect login',
    body: "Copy GarminDB's example config, then open it and fill in your Garmin Connect username and password:",
    command:
      'curl -o ~/.GarminDb/GarminConnectConfig.json https://raw.githubusercontent.com/tcgoetz/GarminDB/master/garmindb/GarminConnectConfig.json.example',
  },
  {
    title: '3. Download & build your database',
    body: "This downloads your history from Garmin Connect and builds the local database files. It can take a while the first time:",
    command: 'garmindb_cli.py --all --download --import --analyze',
  },
  {
    title: '4. Find your files',
    body: 'GarminDB writes its database files here. Drag that folder into the box below.',
    command: '~/HealthData/DBs',
  },
]

export function OnboardingFlow() {
  const [step, setStep] = useState<Step>('welcome')
  const { loadDemo } = useData()
  const [demoError, setDemoError] = useState(false)

  async function handleDemo() {
    setStep('demo-loading')
    setDemoError(false)
    try {
      await loadDemo()
    } catch {
      setDemoError(true)
      setStep('welcome')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <AnimatePresence mode="wait">
          {step === 'welcome' && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="flex flex-col items-center gap-6 text-center"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-400 to-indigo-500 shadow-lg shadow-indigo-500/30">
                <SparkleIcon width={30} height={30} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Welcome to BetterGarmin</h1>
                <p className="mt-2 text-[var(--text-secondary)]">
                  A sleeker, deeper look at your Garmin health data. Everything runs locally in your
                  browser — your data is never uploaded anywhere.
                </p>
              </div>
              <div className="flex w-full flex-col gap-3">
                <Button onClick={() => setStep('guide')}>I have GarminDB data</Button>
                <Button variant="secondary" onClick={handleDemo}>
                  Try demo mode first
                </Button>
              </div>
              {demoError && <p className="text-sm text-rose-400">Couldn't load the demo data. Please try again.</p>}
              <p className="max-w-sm text-xs text-[var(--text-tertiary)]">
                Not affiliated with Garmin. Not medical advice. Built on the open-source{' '}
                <a
                  href="https://github.com/tcgoetz/GarminDB"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-[var(--text-secondary)]"
                >
                  GarminDB
                </a>{' '}
                project.
              </p>
            </motion.div>
          )}

          {step === 'guide' && (
            <motion.div
              key="guide"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="flex flex-col gap-4"
            >
              <button
                type="button"
                onClick={() => setStep('welcome')}
                className="self-start text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                ← Back
              </button>
              <div>
                <h2 className="text-xl font-bold">Get your data onto your computer</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  This happens entirely on your machine. BetterGarmin never sees your Garmin login.
                </p>
              </div>
              {STEPS.map((s) => (
                <Card key={s.title} className="text-left">
                  <p className="font-semibold">{s.title}</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{s.body}</p>
                  <div className="mt-3">
                    <CopyField command={s.command} />
                  </div>
                </Card>
              ))}
              <DropZone />
              <button
                type="button"
                onClick={handleDemo}
                className="self-center text-sm text-[var(--text-secondary)] underline hover:text-[var(--text-primary)]"
              >
                Or just try demo mode instead
              </button>
            </motion.div>
          )}

          {step === 'demo-loading' && (
            <motion.div key="demo-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
              <p className="text-[var(--text-secondary)]">Loading demo data…</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
