#!/usr/bin/env node
/** Render a validated Desktop Bundle release-note manifest. */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const manifestDirectory = new URL('../release-notes/', import.meta.url)

/** @typedef {{ heading: string, items: string[] }} ReleaseNotesSection */
/** @typedef {{ intro: string, sections: ReleaseNotesSection[] }} LocalizedReleaseNotes */
/** @typedef {'official-upstream' | 'previous-release'} BaselineKind */
/** @typedef {{ baselineKind: BaselineKind, baselineRepository: string, releaseRepository: string, baselineCommit: string }} ReleaseNotesSource */
/** @typedef {{ version: string, tag: string, source: ReleaseNotesSource, content: { zh: LocalizedReleaseNotes, en: LocalizedReleaseNotes } }} ReleaseNotesManifest */

const languageMetadata = {
  zh: {
    title: '中文',
    sourceHeading: '来源与比较',
    baselineLabels: {
      'official-upstream': '官方上游基线',
      'previous-release': '上一版本基线',
    },
    compareLabel: '完整比较',
    separator: '：',
  },
  en: {
    title: 'English',
    sourceHeading: 'Source and comparison',
    baselineLabels: {
      'official-upstream': 'Official upstream baseline',
      'previous-release': 'Previous release baseline',
    },
    compareLabel: 'Full comparison',
    separator: ': ',
  },
}

/**
 * Load the tracked release-note manifest for one Desktop Bundle version.
 * @param {string} version - Desktop Bundle version.
 * @returns {Record<string, unknown>} parsed manifest.
 */
export function loadReleaseNotesManifest(version) {
  const manifestUrl = new URL(`${version}.json`, manifestDirectory)
  if (!existsSync(manifestUrl)) {
    throw new Error(`Desktop release-note manifest is missing for ${version}`)
  }
  return JSON.parse(readFileSync(manifestUrl, 'utf8'))
}

/**
 * Narrow an unknown JSON value to an object.
 * @param {unknown} value - parsed JSON value.
 * @returns {Record<string, unknown>} object value.
 */
function record(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Desktop release-note manifest must be an object')
  }
  return value
}

/**
 * Read a required non-empty string.
 * @param {unknown} value - candidate field.
 * @param {string} field - field name for diagnostics.
 * @returns {string} validated string.
 */
function requiredString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Desktop release-note manifest requires ${field}`)
  }
  return value
}

/**
 * Validate how one Desktop release chooses its baseline.
 * @param {unknown} value - candidate baseline kind.
 * @returns {BaselineKind} validated kind.
 */
function baselineKind(value) {
  if (value !== 'official-upstream' && value !== 'previous-release') {
    throw new Error(`Desktop release-note manifest has unsupported baseline kind: ${String(value)}`)
  }
  return value
}

/**
 * Validate one localized release-note body.
 * @param {unknown} value - localized content.
 * @param {'zh' | 'en'} language - language key.
 * @returns {LocalizedReleaseNotes} validated localized content.
 */
function localizedContent(value, language) {
  const content = record(value)
  const intro = requiredString(content.intro, `content.${language}.intro`)
  if (!intro.includes('{{commitCount}}')) {
    throw new Error('Desktop release-note manifest requires complete Chinese and English content')
  }
  if (!Array.isArray(content.sections) || content.sections.length === 0) {
    throw new Error('Desktop release-note manifest requires complete Chinese and English content')
  }
  const sections = content.sections.map((candidate, sectionIndex) => {
    const section = record(candidate)
    const heading = requiredString(
      section.heading,
      `content.${language}.sections[${sectionIndex}].heading`,
    )
    if (!Array.isArray(section.items) || section.items.length === 0) {
      throw new Error('Desktop release-note manifest requires complete Chinese and English content')
    }
    const items = section.items.map((item, itemIndex) =>
      requiredString(item, `content.${language}.sections[${sectionIndex}].items[${itemIndex}]`),
    )
    return { heading, items }
  })
  return { intro, sections }
}

/**
 * Validate the release-note fields needed for deterministic rendering.
 * @param {unknown} value - parsed manifest.
 * @returns {ReleaseNotesManifest} validated manifest.
 */
function releaseNotesManifest(value) {
  const manifest = record(value)
  const sourceValue = record(manifest.source)
  const contentValue = record(manifest.content)
  if (contentValue.zh === undefined || contentValue.en === undefined) {
    throw new Error('Desktop release-note manifest requires complete Chinese and English content')
  }
  const zh = localizedContent(contentValue.zh, 'zh')
  const en = localizedContent(contentValue.en, 'en')
  if (
    zh.sections.length !== en.sections.length ||
    zh.sections.some((section, index) => section.items.length !== en.sections[index]?.items.length)
  ) {
    throw new Error('Desktop release-note manifest requires complete Chinese and English content')
  }
  return {
    version: requiredString(manifest.version, 'version'),
    tag: requiredString(manifest.tag, 'tag'),
    source: {
      baselineKind: baselineKind(sourceValue.baselineKind),
      baselineRepository: requiredString(sourceValue.baselineRepository, 'source.baselineRepository'),
      releaseRepository: requiredString(sourceValue.releaseRepository, 'source.releaseRepository'),
      baselineCommit: requiredString(sourceValue.baselineCommit, 'source.baselineCommit'),
    },
    content: { zh, en },
  }
}

/**
 * Render one language from a Desktop release-note manifest.
 * @param {'zh' | 'en'} language - language to render.
 * @param {LocalizedReleaseNotes} content - localized release-note content.
 * @param {ReleaseNotesSource} source - source repository identifiers.
 * @param {string} tag - Desktop Bundle tag.
 * @param {number} commitCount - commits after the baseline.
 * @returns {string[]} Markdown lines.
 */
function renderLanguage(language, content, source, tag, commitCount) {
  const metadata = languageMetadata[language]
  const intro = content.intro.replace('{{commitCount}}', String(commitCount))
  const lines = [`## ${metadata.title}`, '', intro, '']
  for (const section of content.sections) {
    lines.push(`### ${section.heading}`, '')
    for (const item of section.items) lines.push(`- ${item}`)
    lines.push('')
  }

  const baselineName = `${source.baselineRepository}@${source.baselineCommit}`
  const compareName = `${source.baselineCommit}...${tag}`
  const baselineLabel = metadata.baselineLabels[source.baselineKind]
  lines.push(
    `### ${metadata.sourceHeading}`,
    '',
    `- ${baselineLabel}${metadata.separator}[\`${baselineName}\`](https://github.com/${source.baselineRepository}/commit/${source.baselineCommit})`,
    `- ${metadata.compareLabel}${metadata.separator}[\`${compareName}\`](https://github.com/${source.releaseRepository}/compare/${source.baselineCommit}...${tag})`,
  )
  return lines
}

/**
 * Render one Desktop Bundle release body.
 * @param {{ manifest: unknown, requestedVersion: string, releaseTarget: string, isAncestor: (baseline: string, target: string) => boolean, countCommits: (baseline: string, target: string) => number }} input - manifest and repository state.
 * @returns {string} deterministic Markdown release body.
 */
export function renderReleaseNotes(input) {
  const manifest = releaseNotesManifest(input.manifest)
  if (manifest.version !== input.requestedVersion) {
    throw new Error(
      `Desktop release-note manifest version ${manifest.version} does not match requested Desktop Bundle ${input.requestedVersion}`,
    )
  }
  const expectedTag = `gestalt-v${manifest.version}`
  if (manifest.tag !== expectedTag) {
    throw new Error(
      `Desktop release-note manifest tag ${manifest.tag} does not match version ${manifest.version}`,
    )
  }
  if (!input.isAncestor(manifest.source.baselineCommit, input.releaseTarget)) {
    throw new Error(
      `Desktop release-note baseline is not an ancestor of release target: ${manifest.source.baselineCommit}`,
    )
  }
  const commitCount = input.countCommits(manifest.source.baselineCommit, input.releaseTarget)
  return [
    ...renderLanguage('zh', manifest.content.zh, manifest.source, manifest.tag, commitCount),
    '',
    ...renderLanguage('en', manifest.content.en, manifest.source, manifest.tag, commitCount),
    '',
  ].join('\n')
}

/**
 * Check ancestry using the repository Git graph.
 * @param {string} baseline - baseline commit.
 * @param {string} target - release target commit.
 * @returns {boolean} whether baseline is an ancestor of target.
 */
function gitIsAncestor(baseline, target) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', baseline, target], {
    stdio: 'ignore',
  })
  if (result.status === 0) return true
  if (result.status === 1) return false
  throw new Error(`could not inspect Desktop release ancestry for ${baseline}..${target}`)
}

/**
 * Count commits in one release range using the repository Git graph.
 * @param {string} baseline - excluded baseline commit.
 * @param {string} target - included release target commit.
 * @returns {number} commit count.
 */
function gitCommitCount(baseline, target) {
  const result = spawnSync('git', ['rev-list', '--count', `${baseline}..${target}`], {
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(`could not count Desktop release commits for ${baseline}..${target}`)
  }
  const count = Number(result.stdout.trim())
  if (!Number.isInteger(count)) {
    throw new Error(`git returned an invalid Desktop release commit count: ${result.stdout.trim()}`)
  }
  return count
}

if (process.argv[1]?.endsWith('render-release-notes.mjs') === true) {
  const [requestedVersion, releaseTarget, outputPath] = process.argv.slice(2)
  if (requestedVersion === undefined || releaseTarget === undefined || outputPath === undefined) {
    throw new Error('usage: render-release-notes.mjs <version> <release-target> <output-path>')
  }
  const body = renderReleaseNotes({
    manifest: loadReleaseNotesManifest(requestedVersion),
    requestedVersion,
    releaseTarget,
    isAncestor: gitIsAncestor,
    countCommits: gitCommitCount,
  })
  writeFileSync(outputPath, body)
}
