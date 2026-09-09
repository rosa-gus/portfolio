#!/usr/bin/env node

import { readFileSync, renameSync, rmSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const DEFAULTS = {
  width: 1200,
  height: 800,
  quality: 88,
  gravity: "center",
  fit: "contain",
  background: "auto",
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const projectsFile = join(
  projectRoot,
  "internal",
  "portfolio",
  "data",
  "projects.json",
);
const assetsRoot = join(projectRoot, "web", "assets");
const outputDirectory = join(assetsRoot, "projects", "carousel");

function usage() {
  console.log(`Generate normalized WebP covers for the project carousel.

Usage:
  npm run images:covers
  npm run images:covers -- --only <slug> [options]

Options:
  --only <slug>       Generate only the selected project cover
  --quality <1-100>   WebP quality (default: ${DEFAULTS.quality})
  --gravity <value>   ImageMagick crop anchor (default: ${DEFAULTS.gravity})
  --fit <mode>        contain preserves the image; cover crops it (default: ${DEFAULTS.fit})
  --background <color>  Background used by contain; auto samples the image corner
  --help              Show this help message

Example that fills the frame and crops from the top:
  npm run images:covers -- --only mondo-send --fit cover --gravity north
`);
}

function positiveInteger(value, option) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${option} must be a positive integer.`);
  }
  return parsed;
}

function parseArguments(argumentsList) {
  const options = { ...DEFAULTS, only: "" };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    const value = argumentsList[index + 1];

    if (argument === "--help") {
      usage();
      process.exit(0);
    }

    if (
      ![
        "--only",
        "--quality",
        "--gravity",
        "--fit",
        "--background",
      ].includes(argument)
    ) {
      throw new Error(`Unknown option: ${argument}`);
    }
    if (!value || value.startsWith("--")) {
      throw new Error(`Provide a value for ${argument}.`);
    }

    if (argument === "--only") options.only = value;
    if (argument === "--quality") options.quality = positiveInteger(value, argument);
    if (argument === "--gravity") options.gravity = value;
    if (argument === "--fit") options.fit = value;
    if (argument === "--background") options.background = value;
    index += 1;
  }

  if (options.quality > 100) {
    throw new Error("--quality must be between 1 and 100.");
  }
  if (!["contain", "cover"].includes(options.fit)) {
    throw new Error("--fit must be either contain or cover.");
  }

  return options;
}

function ensureInsideAssets(candidate) {
  const relativePath = relative(assetsRoot, candidate);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    resolve(candidate) !== candidate
  ) {
    throw new Error(`Image path is outside web/assets: ${candidate}`);
  }
}

function resolveCover(project) {
  const cover = project.media?.items?.find(
    (item) => item.id === project.media?.cover,
  );

  if (!cover?.src) {
    throw new Error(`Project "${project.slug}" does not have a valid cover.`);
  }
  if (!cover.src.startsWith("/") || cover.src.includes("?")) {
    throw new Error(
      `The cover for "${project.slug}" must use a root-relative local path.`,
    );
  }

  const input = resolve(assetsRoot, cover.src.slice(1));
  ensureInsideAssets(input);
  return input;
}

function imageMagickOutput(argumentsList, errorMessage) {
  const result = spawnSync("magick", argumentsList, { encoding: "utf8" });
  if (result.error?.code === "ENOENT") {
    throw new Error(
      "ImageMagick was not found. Install it and ensure `magick` is available on PATH.",
    );
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || errorMessage);
  }
  return result.stdout.trim();
}

function imageProperties(input, options) {
  const output = imageMagickOutput(
    [
      `${input}[0]`,
      "-format",
      "%k\nsrgb(%[fx:int(255*r+0.5)],%[fx:int(255*g+0.5)],%[fx:int(255*b+0.5)])",
      "info:",
    ],
    "The image could not be inspected.",
  );
  const [colorCount, cornerColor] = output.split("\n");

  return {
    useLosslessPalette: Number.parseInt(colorCount, 10) <= 16,
    background:
      options.background === "auto" ? cornerColor : options.background,
  };
}

function runImageMagick(input, output, options) {
  const temporaryOutput = join(
    outputDirectory,
    `.${process.pid}-${Date.now()}-${options.width}x${options.height}.webp`,
  );
  const properties = imageProperties(input, options);
  const resizeGeometry = `${options.width}x${options.height}${
    options.fit === "cover" ? "^" : ""
  }`;
  const argumentsList = [
    `${input}[0]`,
    "-auto-orient",
    "-colorspace",
    "sRGB",
    ...(properties.useLosslessPalette ? ["-filter", "point"] : []),
    "-resize",
    resizeGeometry,
    "-background",
    properties.background,
    "-gravity",
    options.gravity,
    "-extent",
    `${options.width}x${options.height}`,
    "-strip",
    "-quality",
    String(options.quality),
    "-define",
    "webp:method=6",
    ...(properties.useLosslessPalette
      ? ["-define", "webp:lossless=true"]
      : []),
    temporaryOutput,
  ];

  try {
    imageMagickOutput(
      argumentsList,
      "ImageMagick could not generate the cover.",
    );
  } catch (error) {
    rmSync(temporaryOutput, { force: true });
    throw error;
  }

  renameSync(temporaryOutput, output);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const projects = JSON.parse(readFileSync(projectsFile, "utf8"));
  const selectedProjects = projects.filter(
    (project) =>
      project.slug && project.media?.cover &&
      (!options.only || project.slug === options.only),
  );

  if (selectedProjects.length === 0) {
    throw new Error(
      options.only
        ? `Project not found: ${options.only}`
        : "No project with a cover was found.",
    );
  }

  const slugs = new Set();
  await mkdir(outputDirectory, { recursive: true });

  for (const project of selectedProjects) {
    if (slugs.has(project.slug)) {
      throw new Error(`Duplicate project slug: ${project.slug}`);
    }
    slugs.add(project.slug);

    const input = resolveCover(project);
    const output = join(outputDirectory, `${project.slug}.webp`);
    if (input === output) {
      console.log(
        `– ${project.slug}: projects.json already points to the normalized cover`,
      );
      continue;
    }
    runImageMagick(input, output, options);
    console.log(
      `✓ ${project.slug}: ${relative(projectRoot, output)} (${options.width}×${options.height})`,
    );
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
