#!/usr/bin/env sh

# Create the json schema for the Zarf structs and use it to create the typescript definitions
go run hack/gen-schema/main.go gen-schema | npx quicktype -s schema -o ./capabilities/zarf-types.ts
