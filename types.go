package main

type dockerConfig struct {
	Auths dockerConfigEntry `json:"auths"`
}

type dockerConfigEntry map[string]dockerConfigEntryWithAuth

type dockerConfigEntryWithAuth struct {
	Auth string `json:"auth"`
}

type registryInfo struct {
	Address string `json:"address" jsonschema:"description=URL address of the registry"`
}

type zarfState struct {
	RegistryInfo registryInfo `json:"registryInfo" jsonschema:"description=Information about the container registry Zarf is configured to use"`
}
