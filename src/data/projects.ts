export interface Project {
  name: string;
  desc: string;
  repo: string;
  href: string;
}

export const PROJECTS: Project[] = [
  {
    name: "Bank Statement Converter",
    desc: "Parses bank statement PDFs into clean, structured data.",
    repo: "tosinshada/bank-statement-converter",
    href: "https://github.com/tosinshada/bank-statement-converter",
  },
  {
    name: "RedisQ",
    desc: "A lightweight queue built on Redis.",
    repo: "tosinshada/RedisQ",
    href: "https://github.com/tosinshada/RedisQ",
  },
];
