import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [".next/**", "node_modules/**", "docs-site/**", "next-env.d.ts", "public/**", "beta-web/**"], // docs-site 는 VitePress 별도 프로젝트, public 은 정적 자산(위젯 JS 포함), beta-web 은 은퇴한 정적 베타
  },
];

export default eslintConfig;
