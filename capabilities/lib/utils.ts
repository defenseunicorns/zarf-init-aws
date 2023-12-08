import { privateECRURLPattern } from "../ecr-private";
import { publicECRURLPattern } from "../ecr-public";

export function isPrivateECRURL(url: string): boolean {
  return privateECRURLPattern.test(url);
}

export function isPublicECRURL(url: string): boolean {
  return publicECRURLPattern.test(url);
}
