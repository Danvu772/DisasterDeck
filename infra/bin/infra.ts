#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { DisasterDeckStack } from "../lib/disasterdeck-stack";

const app = new cdk.App();
new DisasterDeckStack(app, "DisasterDeckStack");