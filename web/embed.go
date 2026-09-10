package web

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"strings"
)

const AssetManifestFilename = "vite-manifest.json"

//go:embed dist
var files embed.FS

type AppAssets struct {
	Script      string
	Stylesheets []string
}

type manifestChunk struct {
	File    string   `json:"file"`
	CSS     []string `json:"css"`
	IsEntry bool     `json:"isEntry"`
}

var assets = loadAppAssets()

func Static() fs.FS {
	static, err := fs.Sub(files, "dist")
	if err != nil {
		panic(err)
	}
	return static
}

func Assets() AppAssets {
	return AppAssets{
		Script:      assets.Script,
		Stylesheets: append([]string(nil), assets.Stylesheets...),
	}
}

func loadAppAssets() AppAssets {
	manifestData, err := files.ReadFile("dist/" + AssetManifestFilename)
	if err != nil {
		panic(fmt.Errorf("read Vite asset manifest: %w", err))
	}

	var manifest map[string]manifestChunk
	if err := json.Unmarshal(manifestData, &manifest); err != nil {
		panic(fmt.Errorf("decode Vite asset manifest: %w", err))
	}

	var entry *manifestChunk
	for _, chunk := range manifest {
		if !chunk.IsEntry {
			continue
		}
		if entry != nil {
			panic("Vite asset manifest contains more than one entry")
		}
		chunkCopy := chunk
		entry = &chunkCopy
	}
	if entry == nil {
		panic("Vite asset manifest does not contain an entry")
	}
	if entry.File == "" {
		panic("Vite asset manifest entry does not contain a script")
	}
	if len(entry.CSS) == 0 {
		panic("Vite asset manifest entry does not contain a stylesheet")
	}

	resolved := AppAssets{
		Script:      assetPath(entry.File),
		Stylesheets: make([]string, 0, len(entry.CSS)),
	}
	for _, stylesheet := range entry.CSS {
		if stylesheet == "" {
			panic("Vite asset manifest entry contains an empty stylesheet")
		}
		resolved.Stylesheets = append(resolved.Stylesheets, assetPath(stylesheet))
	}
	return resolved
}

func assetPath(filename string) string {
	return "/" + strings.TrimLeft(filename, "/")
}
