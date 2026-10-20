/**
 * Scientific evidence registry: every intelligence feature names the work its method rests on. Citations are given
 * as journal references; DOIs are omitted rather than risk a wrong one.
 */

export interface Reference {
  id: string
  cite: string
  /** What this reference supports in BetterGarmin, in one line. */
  supports: string
  kind: 'consensus' | 'meta-analysis' | 'prospective' | 'observational' | 'methods' | 'model'
}

export const REFERENCES: Record<string, Reference> = {
  plews2013: {
    id: 'plews2013',
    cite: 'Plews DJ, Laursen PB, Stanley J, Kilding AE, Buchheit M. Training adaptation and heart rate variability in elite endurance athletes: opening the door to effective monitoring. Sports Med. 2013;43(9):773–781.',
    supports: 'Rolling 7-day HRV averages compared with an individual baseline, and the "smallest worthwhile change" idea, are more informative than single-day values.',
    kind: 'observational',
  },
  buchheit2014: {
    id: 'buchheit2014',
    cite: 'Buchheit M. Monitoring training status with HR measures: do all roads lead to Rome? Front Physiol. 2014;5:73.',
    supports: 'Resting HR and HRV trends reflect training status only when interpreted against personal baselines and context.',
    kind: 'observational',
  },
  radin2020: {
    id: 'radin2020',
    cite: 'Radin JM, Wineinger NE, Topol EJ, Steinhubl SR. Harnessing wearable device data to improve state-level real-time surveillance of influenza-like illness in the USA: a population-based study. Lancet Digit Health. 2020;2(2):e85–e93.',
    supports: 'Elevated resting HR and changed sleep relative to a person’s own baseline accompany influenza-like illness at population level.',
    kind: 'observational',
  },
  mishra2020: {
    id: 'mishra2020',
    cite: 'Mishra T, Wang M, Metwally AA, et al. Pre-symptomatic detection of COVID-19 from smartwatch data. Nat Biomed Eng. 2020;4:1208–1220.',
    supports: 'Resting HR deviations from a personal baseline can precede symptoms of infection; single-signal alarms produce many false positives.',
    kind: 'observational',
  },
  quer2021: {
    id: 'quer2021',
    cite: 'Quer G, Radin JM, Gadaleta M, et al. Wearable sensor data and self-reported symptoms for COVID-19 detection. Nat Med. 2021;27:73–77.',
    supports: 'Combining several wearable signals (resting HR, sleep, activity) discriminates better than any single one.',
    kind: 'prospective',
  },
  watson2015: {
    id: 'watson2015',
    cite: 'Watson NF, Badr MS, Belenky G, et al. Recommended amount of sleep for a healthy adult: a joint consensus statement of the American Academy of Sleep Medicine and Sleep Research Society. Sleep. 2015;38(6):843–844.',
    supports: 'Adults should regularly sleep 7 hours or more per night.',
    kind: 'consensus',
  },
  vandongen2003: {
    id: 'vandongen2003',
    cite: 'Van Dongen HPA, Maislin G, Mullington JM, Dinges DF. The cumulative cost of additional wakefulness: dose-response effects on neurobehavioral functions and sleep physiology from chronic sleep restriction and total sleep deprivation. Sleep. 2003;26(2):117–126.',
    supports: 'Repeated short nights accumulate measurable deficits that people underestimate; one night does not reset them.',
    kind: 'prospective',
  },
  wittmann2006: {
    id: 'wittmann2006',
    cite: 'Wittmann M, Dinich J, Merrow M, Roenneberg T. Social jetlag: misalignment of biological and social time. Chronobiol Int. 2006;23(1-2):497–509.',
    supports: 'Social jetlag: the difference between sleep midpoints on free days and work days.',
    kind: 'observational',
  },
  phillips2017: {
    id: 'phillips2017',
    cite: 'Phillips AJK, Clerx WM, O’Brien CS, et al. Irregular sleep/wake patterns are associated with poorer academic performance and delayed circadian and sleep/wake timing. Sci Rep. 2017;7:3216.',
    supports: 'Day-to-day regularity of sleep timing matters separately from duration (Sleep Regularity Index, which needs epoch-level sleep/wake data).',
    kind: 'observational',
  },
  borbely1982: {
    id: 'borbely1982',
    cite: 'Borbély AA. A two process model of sleep regulation. Hum Neurobiol. 1982;1(3):195–204.',
    supports: 'Sleep pressure builds with time awake and interacts with a circadian process (basis for any alertness model).',
    kind: 'model',
  },
  sen1968: {
    id: 'sen1968',
    cite: 'Sen PK. Estimates of the regression coefficient based on Kendall’s tau. J Am Stat Assoc. 1968;63(324):1379–1389.',
    supports: 'Theil–Sen slope: a trend estimate that isn’t thrown by occasional outlying days.',
    kind: 'methods',
  },
  leys2013: {
    id: 'leys2013',
    cite: 'Leys C, Ley C, Klein O, Bernard P, Licata L. Detecting outliers: do not use standard deviation around the mean, use absolute deviation around the median. J Exp Soc Psychol. 2013;49(4):764–766.',
    supports: 'Median and median absolute deviation as robust baselines for deviation detection.',
    kind: 'methods',
  },
  vansomeren1999: {
    id: 'vansomeren1999',
    cite: 'Van Someren EJW, Swaab DF, Colenda CC, et al. Bright light therapy: improved sensitivity to its effects on rest-activity rhythms in Alzheimer patients by application of nonparametric methods. Chronobiol Int. 1999;16(4):505–518.',
    supports: 'Interdaily stability and intradaily variability of rest-activity rhythms (needs epoch-level activity data).',
    kind: 'methods',
  },
}
