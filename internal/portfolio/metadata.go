package portfolio

import (
	"fmt"
	"strings"
	"time"
)

type MetadataEntry struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

func validateMetadata(entries []MetadataEntry) error {
	for index, entry := range entries {
		if strings.TrimSpace(entry.Label) == "" || strings.TrimSpace(entry.Value) == "" {
			return fmt.Errorf("entry %d requires a label and value", index)
		}
	}
	return nil
}

func validateDate(date string) error {
	if date == "" {
		return nil
	}
	_, err := time.Parse(time.DateOnly, date)
	return err
}
