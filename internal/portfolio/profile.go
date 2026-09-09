package portfolio

import (
	"encoding/json"
	"fmt"
)

type ProfileContent struct {
	Identity     ProfileIdentity     `json:"identity"`
	SEO          ProfileSEO          `json:"seo"`
	Introduction ProfileIntroduction `json:"introduction"`
	Career       ProfileCareer       `json:"career"`
	About        ProfileAbout        `json:"about"`
	Contact      ContactDetails      `json:"contact"`
}

type ProfileIdentity struct {
	Name              string `json:"name"`
	DisplayName       string `json:"displayName"`
	Profession        string `json:"profession"`
	ProfessionalTitle string `json:"professionalTitle"`
}

type ProfileSEO struct {
	Title          string `json:"title"`
	Description    string `json:"description"`
	SocialImageAlt string `json:"socialImageAlt"`
}

type ProfileIntroduction struct {
	Availability string `json:"availability"`
	Heading      string `json:"heading"`
	Summary      string `json:"summary"`
}

type ProfileCareer struct {
	Heading string               `json:"heading"`
	Entries []ProfileCareerEntry `json:"entries"`
}

type ProfileCareerEntry struct {
	Period        string   `json:"period"`
	Title         string   `json:"title"`
	Context       string   `json:"context"`
	Description   string   `json:"description"`
	DetailLabel   string   `json:"detailLabel"`
	Detail        string   `json:"detail,omitempty"`
	EvidenceSlugs []string `json:"evidenceSlugs,omitempty"`
}

type ProfileAbout struct {
	Heading    string            `json:"heading"`
	Paragraphs []string          `json:"paragraphs"`
	Media      ProfileMediaStudy `json:"media"`
}

type ProfileMediaStudy struct {
	Label       string `json:"label"`
	Description string `json:"description"`
	Technique   string `json:"technique"`
}

var Profile = mustLoadProfile()

func mustLoadProfile() ProfileContent {
	profileJSON, err := contentFiles.ReadFile("data/profile.json")
	if err != nil {
		panic(fmt.Errorf("read profile: %w", err))
	}

	var profile ProfileContent
	if err := json.Unmarshal(profileJSON, &profile); err != nil {
		panic(fmt.Errorf("load profile: %w", err))
	}
	return profile
}
