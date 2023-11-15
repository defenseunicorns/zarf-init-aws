// Package main generates a JSON schema from Zarf types and prints it to stdout
package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/alecthomas/jsonschema"
	"github.com/defenseunicorns/zarf/src/types"
)

type zarfTypes struct {
	DeployedPackage types.DeployedPackage
	ZarfState       types.ZarfState
}

func main() {
	schema := jsonschema.Reflect(&zarfTypes{})
	output, err := json.MarshalIndent(schema, "", "  ")
	if err != nil {
		fmt.Printf("unable to generate the JSON schema from the Zarf types: %v\n", err)
		os.Exit(1)
	}
	fmt.Print(string(output) + "\n")
}
