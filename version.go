package portfolio

import (
	_ "embed"
	"encoding/json"
	"fmt"
)

//go:embed package.json
var packageJSON []byte

var version = loadVersion()

// Version returns the application version from package.json.
func Version() string {
	return version
}

func loadVersion() string {
	var manifest struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(packageJSON, &manifest); err != nil {
		panic(fmt.Errorf("read application version: %w", err))
	}
	if manifest.Version == "" {
		panic("missing application version in package.json")
	}
	return manifest.Version
}
