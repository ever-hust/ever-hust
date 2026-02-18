import { db } from "./client";
import { jobs } from "./schema/jobs";

// ---------------------------------------------------------------------------
// Helper: deterministic pseudo-random (seeded) to keep data stable across runs
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}
function pickN<T>(arr: readonly T[], n: number): T[] {
  const shuffled = [...arr].sort(() => rand() - 0.5);
  return shuffled.slice(0, n);
}
function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function roundToNearest(value: number, nearest: number): number {
  return Math.round(value / nearest) * nearest;
}

// ---------------------------------------------------------------------------
// Data pools
// ---------------------------------------------------------------------------

const SITES = [
  { key: "linkedin", prefix: "li" },
  { key: "indeed", prefix: "indeed" },
  { key: "glassdoor", prefix: "gd" },
  { key: "ziprecruiter", prefix: "zr" },
  { key: "google", prefix: "goog" },
] as const;

interface CompanyInfo {
  name: string;
  url: string;
  industry: string;
  numEmployees: string;
  description: string;
}

const COMPANIES: CompanyInfo[] = [
  {
    name: "Google",
    url: "https://google.com",
    industry: "Technology",
    numEmployees: "150,000+",
    description:
      "A multinational technology company specializing in internet-related services and products, including search, cloud computing, advertising, and AI.",
  },
  {
    name: "Apple",
    url: "https://apple.com",
    industry: "Consumer Electronics",
    numEmployees: "160,000+",
    description:
      "A global technology company that designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories.",
  },
  {
    name: "Microsoft",
    url: "https://microsoft.com",
    industry: "Technology",
    numEmployees: "220,000+",
    description:
      "A multinational corporation producing computer software, consumer electronics, personal computers, and related services.",
  },
  {
    name: "Amazon",
    url: "https://amazon.com",
    industry: "E-Commerce & Cloud",
    numEmployees: "1,500,000+",
    description:
      "A multinational technology company focused on e-commerce, cloud computing (AWS), digital streaming, and artificial intelligence.",
  },
  {
    name: "Meta",
    url: "https://meta.com",
    industry: "Social Media & Technology",
    numEmployees: "70,000+",
    description:
      "A technology conglomerate focused on social media platforms, virtual reality, and the metaverse, including Facebook, Instagram, and WhatsApp.",
  },
  {
    name: "Netflix",
    url: "https://netflix.com",
    industry: "Entertainment & Streaming",
    numEmployees: "13,000+",
    description:
      "A global streaming entertainment service offering TV series, documentaries, feature films, and mobile games.",
  },
  {
    name: "Stripe",
    url: "https://stripe.com",
    industry: "Fintech",
    numEmployees: "8,000+",
    description:
      "A financial infrastructure platform for businesses, providing payment processing, billing, and financial services APIs.",
  },
  {
    name: "Shopify",
    url: "https://shopify.com",
    industry: "E-Commerce",
    numEmployees: "10,000+",
    description:
      "A commerce platform that allows anyone to set up an online store, manage sales, and build a brand.",
  },
  {
    name: "Airbnb",
    url: "https://airbnb.com",
    industry: "Travel & Hospitality",
    numEmployees: "6,000+",
    description:
      "An online marketplace that connects people who want to rent out their homes with travelers looking for accommodations.",
  },
  {
    name: "Uber",
    url: "https://uber.com",
    industry: "Transportation",
    numEmployees: "32,000+",
    description:
      "A technology company offering ride-hailing, food delivery (Uber Eats), freight transport, and electric bicycle sharing.",
  },
  {
    name: "Lyft",
    url: "https://lyft.com",
    industry: "Transportation",
    numEmployees: "4,000+",
    description:
      "A ride-sharing company offering transportation services, bike and scooter rentals, and autonomous vehicle development.",
  },
  {
    name: "Spotify",
    url: "https://spotify.com",
    industry: "Music & Audio Streaming",
    numEmployees: "9,000+",
    description:
      "A digital music, podcast, and video service providing access to millions of songs and other content from creators.",
  },
  {
    name: "Slack",
    url: "https://slack.com",
    industry: "Enterprise Software",
    numEmployees: "3,500+",
    description:
      "A channel-based messaging platform used by teams to collaborate, share files, and integrate with other workplace tools.",
  },
  {
    name: "Zoom",
    url: "https://zoom.us",
    industry: "Communications",
    numEmployees: "8,000+",
    description:
      "A communications technology company providing video conferencing, online meetings, chat, and collaboration tools.",
  },
  {
    name: "Figma",
    url: "https://figma.com",
    industry: "Design Tools",
    numEmployees: "1,500+",
    description:
      "A collaborative interface design tool that enables teams to design, prototype, and gather feedback all in the browser.",
  },
  {
    name: "Notion",
    url: "https://notion.so",
    industry: "Productivity Software",
    numEmployees: "800+",
    description:
      "An all-in-one workspace for notes, tasks, wikis, and databases, designed for individuals and teams.",
  },
  {
    name: "Vercel",
    url: "https://vercel.com",
    industry: "Developer Tools",
    numEmployees: "600+",
    description:
      "A cloud platform for frontend frameworks and static sites, providing seamless deployment and edge network delivery.",
  },
  {
    name: "Supabase",
    url: "https://supabase.com",
    industry: "Developer Tools",
    numEmployees: "300+",
    description:
      "An open source Firebase alternative providing a Postgres database, authentication, instant APIs, realtime subscriptions, and storage.",
  },
  {
    name: "Cloudflare",
    url: "https://cloudflare.com",
    industry: "Internet Security & CDN",
    numEmployees: "4,000+",
    description:
      "A web infrastructure and security company providing content delivery network services, DDoS mitigation, and internet security.",
  },
  {
    name: "Datadog",
    url: "https://datadoghq.com",
    industry: "Cloud Monitoring",
    numEmployees: "5,000+",
    description:
      "A monitoring and analytics platform for cloud-scale infrastructure, applications, logs, and more.",
  },
  {
    name: "Twilio",
    url: "https://twilio.com",
    industry: "Communications APIs",
    numEmployees: "7,000+",
    description:
      "A cloud communications platform enabling developers to programmatically make and receive phone calls, send text messages, and more.",
  },
  {
    name: "Palantir",
    url: "https://palantir.com",
    industry: "Data Analytics",
    numEmployees: "3,500+",
    description:
      "A software company specializing in big data analytics, providing platforms for data integration, analysis, and intelligence.",
  },
  {
    name: "Coinbase",
    url: "https://coinbase.com",
    industry: "Cryptocurrency",
    numEmployees: "3,500+",
    description:
      "A cryptocurrency exchange platform allowing users to buy, sell, and manage their cryptocurrency portfolio.",
  },
  {
    name: "Plaid",
    url: "https://plaid.com",
    industry: "Fintech",
    numEmployees: "1,200+",
    description:
      "A fintech company building infrastructure connecting consumer bank accounts to financial applications.",
  },
  {
    name: "Databricks",
    url: "https://databricks.com",
    industry: "Data & AI",
    numEmployees: "5,500+",
    description:
      "A unified analytics platform providing collaborative data science, data engineering, and machine learning capabilities built on Apache Spark.",
  },
  {
    name: "HashiCorp",
    url: "https://hashicorp.com",
    industry: "Infrastructure Software",
    numEmployees: "2,000+",
    description:
      "An infrastructure software company whose tools help organizations provision, secure, connect, and run cloud infrastructure.",
  },
  {
    name: "Retool",
    url: "https://retool.com",
    industry: "Developer Tools",
    numEmployees: "500+",
    description:
      "A low-code platform that helps companies build internal tools rapidly by connecting to databases, APIs, and other services.",
  },
  {
    name: "Linear",
    url: "https://linear.app",
    industry: "Productivity Software",
    numEmployees: "80+",
    description:
      "A streamlined project management and issue tracking tool designed for modern software teams.",
  },
  {
    name: "Railway",
    url: "https://railway.app",
    industry: "Developer Tools",
    numEmployees: "60+",
    description:
      "A modern cloud platform that makes deploying, managing, and scaling applications effortless for developers.",
  },
  {
    name: "Neon",
    url: "https://neon.tech",
    industry: "Database Infrastructure",
    numEmployees: "150+",
    description:
      "A serverless Postgres database platform offering autoscaling, branching, and bottomless storage for modern applications.",
  },
  {
    name: "Planetscale",
    url: "https://planetscale.com",
    industry: "Database Infrastructure",
    numEmployees: "200+",
    description:
      "A MySQL-compatible serverless database platform built on Vitess, offering branching workflows, non-blocking schema changes, and global deployment.",
  },
  {
    name: "Loom",
    url: "https://loom.com",
    industry: "Video Communications",
    numEmployees: "400+",
    description:
      "An asynchronous video messaging platform that helps teams communicate more effectively through quick screen recordings.",
  },
  {
    name: "Postman",
    url: "https://postman.com",
    industry: "Developer Tools",
    numEmployees: "800+",
    description:
      "An API platform for building, testing, and using APIs, simplifying each step of the API lifecycle.",
  },
  {
    name: "Grafana Labs",
    url: "https://grafana.com",
    industry: "Observability",
    numEmployees: "1,200+",
    description:
      "The company behind Grafana, providing an open and composable observability and data visualization platform.",
  },
  {
    name: "Sentry",
    url: "https://sentry.io",
    industry: "Developer Tools",
    numEmployees: "600+",
    description:
      "An application monitoring platform that helps developers identify, triage, and resolve errors and performance issues in real-time.",
  },
];

interface RoleTemplate {
  title: string;
  department: string;
  team: string;
  jobFunction: string;
  baseSkills: string[];
  level: string;
  salaryBand: [number, number]; // [min, max] in thousands
}

const ROLE_TEMPLATES: RoleTemplate[] = [
  // --- Frontend ---
  {
    title: "Junior Frontend Developer",
    department: "Engineering",
    team: "Frontend",
    jobFunction: "Software Engineering",
    baseSkills: ["JavaScript", "React", "HTML", "CSS", "Git"],
    level: "junior",
    salaryBand: [80, 120],
  },
  {
    title: "Frontend Engineer",
    department: "Engineering",
    team: "Frontend",
    jobFunction: "Software Engineering",
    baseSkills: ["TypeScript", "React", "Next.js", "Tailwind CSS", "Jest"],
    level: "mid",
    salaryBand: [120, 165],
  },
  {
    title: "Senior Frontend Engineer",
    department: "Engineering",
    team: "Frontend",
    jobFunction: "Software Engineering",
    baseSkills: [
      "TypeScript",
      "React",
      "Next.js",
      "GraphQL",
      "Performance Optimization",
      "Accessibility",
    ],
    level: "senior",
    salaryBand: [155, 220],
  },
  {
    title: "Staff Frontend Engineer",
    department: "Engineering",
    team: "Frontend Platform",
    jobFunction: "Software Engineering",
    baseSkills: [
      "TypeScript",
      "React",
      "System Design",
      "Design Systems",
      "Web Performance",
      "Webpack",
    ],
    level: "staff",
    salaryBand: [200, 290],
  },
  // --- Backend ---
  {
    title: "Backend Engineer",
    department: "Engineering",
    team: "Backend",
    jobFunction: "Software Engineering",
    baseSkills: ["Python", "PostgreSQL", "Redis", "REST APIs", "Docker"],
    level: "mid",
    salaryBand: [125, 170],
  },
  {
    title: "Senior Backend Engineer",
    department: "Engineering",
    team: "Backend",
    jobFunction: "Software Engineering",
    baseSkills: [
      "Go",
      "PostgreSQL",
      "Kubernetes",
      "gRPC",
      "Microservices",
      "AWS",
    ],
    level: "senior",
    salaryBand: [160, 225],
  },
  {
    title: "Staff Backend Engineer",
    department: "Engineering",
    team: "Platform",
    jobFunction: "Software Engineering",
    baseSkills: [
      "Go",
      "Distributed Systems",
      "Kubernetes",
      "System Design",
      "Kafka",
      "PostgreSQL",
    ],
    level: "staff",
    salaryBand: [210, 300],
  },
  // --- Full Stack ---
  {
    title: "Full Stack Developer",
    department: "Engineering",
    team: "Product Engineering",
    jobFunction: "Software Engineering",
    baseSkills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Docker"],
    level: "mid",
    salaryBand: [120, 165],
  },
  {
    title: "Senior Full Stack Engineer",
    department: "Engineering",
    team: "Product Engineering",
    jobFunction: "Software Engineering",
    baseSkills: [
      "TypeScript",
      "React",
      "Node.js",
      "PostgreSQL",
      "AWS",
      "CI/CD",
    ],
    level: "senior",
    salaryBand: [155, 220],
  },
  // --- DevOps / SRE ---
  {
    title: "DevOps Engineer",
    department: "Engineering",
    team: "Infrastructure",
    jobFunction: "DevOps",
    baseSkills: [
      "Terraform",
      "AWS",
      "Docker",
      "Kubernetes",
      "CI/CD",
      "Linux",
    ],
    level: "mid",
    salaryBand: [130, 175],
  },
  {
    title: "Senior DevOps Engineer",
    department: "Engineering",
    team: "Infrastructure",
    jobFunction: "DevOps",
    baseSkills: [
      "Terraform",
      "AWS",
      "Kubernetes",
      "Helm",
      "Prometheus",
      "Grafana",
      "ArgoCD",
    ],
    level: "senior",
    salaryBand: [160, 225],
  },
  {
    title: "Site Reliability Engineer",
    department: "Engineering",
    team: "SRE",
    jobFunction: "DevOps",
    baseSkills: [
      "Go",
      "Kubernetes",
      "Prometheus",
      "Terraform",
      "Linux",
      "Incident Management",
    ],
    level: "senior",
    salaryBand: [165, 230],
  },
  // --- Data ---
  {
    title: "Data Scientist",
    department: "Data",
    team: "Data Science",
    jobFunction: "Data Science",
    baseSkills: [
      "Python",
      "SQL",
      "Pandas",
      "Scikit-learn",
      "Statistics",
      "Jupyter",
    ],
    level: "mid",
    salaryBand: [130, 175],
  },
  {
    title: "Senior Data Scientist",
    department: "Data",
    team: "Data Science",
    jobFunction: "Data Science",
    baseSkills: [
      "Python",
      "SQL",
      "Machine Learning",
      "Deep Learning",
      "A/B Testing",
      "Spark",
    ],
    level: "senior",
    salaryBand: [165, 230],
  },
  {
    title: "Data Engineer",
    department: "Data",
    team: "Data Engineering",
    jobFunction: "Data Engineering",
    baseSkills: [
      "Python",
      "SQL",
      "Spark",
      "Airflow",
      "dbt",
      "Snowflake",
    ],
    level: "mid",
    salaryBand: [130, 175],
  },
  {
    title: "Senior Data Engineer",
    department: "Data",
    team: "Data Engineering",
    jobFunction: "Data Engineering",
    baseSkills: [
      "Python",
      "Spark",
      "Kafka",
      "Airflow",
      "dbt",
      "Snowflake",
      "AWS",
    ],
    level: "senior",
    salaryBand: [160, 225],
  },
  // --- ML / AI ---
  {
    title: "Machine Learning Engineer",
    department: "Engineering",
    team: "ML Platform",
    jobFunction: "Machine Learning",
    baseSkills: [
      "Python",
      "PyTorch",
      "TensorFlow",
      "MLOps",
      "Docker",
      "SQL",
    ],
    level: "mid",
    salaryBand: [140, 185],
  },
  {
    title: "Senior ML Engineer",
    department: "Engineering",
    team: "ML Platform",
    jobFunction: "Machine Learning",
    baseSkills: [
      "Python",
      "PyTorch",
      "LLMs",
      "RAG",
      "Kubernetes",
      "MLOps",
      "Distributed Training",
    ],
    level: "senior",
    salaryBand: [175, 250],
  },
  {
    title: "AI Research Scientist",
    department: "Research",
    team: "AI Research",
    jobFunction: "Machine Learning",
    baseSkills: [
      "Python",
      "PyTorch",
      "Deep Learning",
      "NLP",
      "Computer Vision",
      "Research",
    ],
    level: "senior",
    salaryBand: [185, 270],
  },
  // --- Mobile ---
  {
    title: "iOS Developer",
    department: "Engineering",
    team: "Mobile",
    jobFunction: "Mobile Development",
    baseSkills: ["Swift", "SwiftUI", "UIKit", "Xcode", "Core Data", "REST APIs"],
    level: "mid",
    salaryBand: [125, 170],
  },
  {
    title: "Senior Android Engineer",
    department: "Engineering",
    team: "Mobile",
    jobFunction: "Mobile Development",
    baseSkills: [
      "Kotlin",
      "Jetpack Compose",
      "Android SDK",
      "Coroutines",
      "Room",
      "Retrofit",
    ],
    level: "senior",
    salaryBand: [155, 220],
  },
  {
    title: "React Native Developer",
    department: "Engineering",
    team: "Mobile",
    jobFunction: "Mobile Development",
    baseSkills: [
      "React Native",
      "TypeScript",
      "Redux",
      "Expo",
      "REST APIs",
      "Jest",
    ],
    level: "mid",
    salaryBand: [120, 165],
  },
  // --- Security ---
  {
    title: "Security Engineer",
    department: "Engineering",
    team: "Security",
    jobFunction: "Security",
    baseSkills: [
      "Application Security",
      "Penetration Testing",
      "OWASP",
      "Python",
      "Cloud Security",
      "SAST/DAST",
    ],
    level: "senior",
    salaryBand: [165, 230],
  },
  // --- Product & Design ---
  {
    title: "Product Manager",
    department: "Product",
    team: "Product Management",
    jobFunction: "Product Management",
    baseSkills: [
      "Product Strategy",
      "Roadmapping",
      "Agile",
      "Data Analysis",
      "User Research",
      "Jira",
    ],
    level: "mid",
    salaryBand: [130, 175],
  },
  {
    title: "Senior Product Manager",
    department: "Product",
    team: "Product Management",
    jobFunction: "Product Management",
    baseSkills: [
      "Product Strategy",
      "Roadmapping",
      "Stakeholder Management",
      "A/B Testing",
      "SQL",
      "OKRs",
    ],
    level: "senior",
    salaryBand: [165, 230],
  },
  {
    title: "Product Designer",
    department: "Design",
    team: "Product Design",
    jobFunction: "Design",
    baseSkills: [
      "Figma",
      "User Research",
      "Wireframing",
      "Prototyping",
      "Design Systems",
      "Usability Testing",
    ],
    level: "mid",
    salaryBand: [115, 160],
  },
  {
    title: "Senior Product Designer",
    department: "Design",
    team: "Product Design",
    jobFunction: "Design",
    baseSkills: [
      "Figma",
      "Design Systems",
      "User Research",
      "Prototyping",
      "Interaction Design",
      "Accessibility",
    ],
    level: "senior",
    salaryBand: [150, 210],
  },
  // --- QA ---
  {
    title: "QA Engineer",
    department: "Engineering",
    team: "Quality Assurance",
    jobFunction: "Quality Assurance",
    baseSkills: [
      "Selenium",
      "Cypress",
      "Test Planning",
      "API Testing",
      "SQL",
      "Jira",
    ],
    level: "mid",
    salaryBand: [100, 145],
  },
  {
    title: "Senior QA Automation Engineer",
    department: "Engineering",
    team: "Quality Assurance",
    jobFunction: "Quality Assurance",
    baseSkills: [
      "Playwright",
      "Cypress",
      "TypeScript",
      "CI/CD",
      "API Testing",
      "Performance Testing",
    ],
    level: "senior",
    salaryBand: [140, 195],
  },
  // --- Management ---
  {
    title: "Engineering Manager",
    department: "Engineering",
    team: "Engineering Management",
    jobFunction: "Engineering Management",
    baseSkills: [
      "People Management",
      "Agile",
      "Technical Architecture",
      "Hiring",
      "Mentoring",
      "Project Planning",
    ],
    level: "manager",
    salaryBand: [185, 260],
  },
  {
    title: "Director of Engineering",
    department: "Engineering",
    team: "Engineering Leadership",
    jobFunction: "Engineering Management",
    baseSkills: [
      "Engineering Strategy",
      "Organizational Design",
      "Stakeholder Management",
      "Budgeting",
      "Technical Vision",
      "Cross-functional Leadership",
    ],
    level: "director",
    salaryBand: [230, 320],
  },
  {
    title: "Technical Lead",
    department: "Engineering",
    team: "Product Engineering",
    jobFunction: "Software Engineering",
    baseSkills: [
      "System Design",
      "Code Review",
      "TypeScript",
      "Architecture",
      "Mentoring",
      "Agile",
    ],
    level: "lead",
    salaryBand: [175, 245],
  },
  // --- Cloud / Platform ---
  {
    title: "Cloud Platform Engineer",
    department: "Engineering",
    team: "Cloud Platform",
    jobFunction: "Cloud Engineering",
    baseSkills: [
      "AWS",
      "Terraform",
      "CloudFormation",
      "Python",
      "Networking",
      "IAM",
    ],
    level: "mid",
    salaryBand: [130, 175],
  },
  {
    title: "Senior Platform Engineer",
    department: "Engineering",
    team: "Platform",
    jobFunction: "Platform Engineering",
    baseSkills: [
      "Kubernetes",
      "Go",
      "Terraform",
      "Service Mesh",
      "Observability",
      "AWS",
    ],
    level: "senior",
    salaryBand: [165, 230],
  },
];

interface LocationInfo {
  city: string;
  state: string;
  country: string;
}

const LOCATIONS: LocationInfo[] = [
  { city: "San Francisco", state: "CA", country: "USA" },
  { city: "New York", state: "NY", country: "USA" },
  { city: "Seattle", state: "WA", country: "USA" },
  { city: "Austin", state: "TX", country: "USA" },
  { city: "Chicago", state: "IL", country: "USA" },
  { city: "Los Angeles", state: "CA", country: "USA" },
  { city: "Boston", state: "MA", country: "USA" },
  { city: "Denver", state: "CO", country: "USA" },
  { city: "Miami", state: "FL", country: "USA" },
  { city: "Portland", state: "OR", country: "USA" },
  { city: "San Jose", state: "CA", country: "USA" },
  { city: "Palo Alto", state: "CA", country: "USA" },
  { city: "Menlo Park", state: "CA", country: "USA" },
  { city: "Mountain View", state: "CA", country: "USA" },
  { city: "Sunnyvale", state: "CA", country: "USA" },
];

const BONUS_SKILLS: Record<string, string[]> = {
  "Software Engineering": [
    "Agile",
    "Scrum",
    "CI/CD",
    "Code Review",
    "Git",
    "Linux",
    "REST APIs",
    "Microservices",
    "TDD",
  ],
  DevOps: [
    "Ansible",
    "Jenkins",
    "GitHub Actions",
    "DataDog",
    "PagerDuty",
    "Shell Scripting",
    "Networking",
  ],
  "Data Science": [
    "R",
    "Tableau",
    "PowerBI",
    "BigQuery",
    "Redshift",
    "Statistical Modeling",
  ],
  "Data Engineering": [
    "AWS Glue",
    "Redshift",
    "BigQuery",
    "Fivetran",
    "Delta Lake",
    "Data Modeling",
  ],
  "Machine Learning": [
    "CUDA",
    "Hugging Face",
    "LangChain",
    "Vector Databases",
    "Feature Engineering",
    "Model Serving",
  ],
  "Mobile Development": [
    "CI/CD",
    "App Store Optimization",
    "Firebase",
    "Analytics",
    "Push Notifications",
  ],
  Security: [
    "SOC 2",
    "ISO 27001",
    "Threat Modeling",
    "Incident Response",
    "Encryption",
  ],
  "Product Management": [
    "Analytics",
    "Figma",
    "SQL",
    "Growth Strategy",
    "User Interviews",
    "Amplitude",
  ],
  Design: [
    "Sketch",
    "Adobe XD",
    "Illustration",
    "Typography",
    "Color Theory",
    "Motion Design",
  ],
  "Quality Assurance": [
    "Load Testing",
    "Postman",
    "Test Automation Frameworks",
    "Mobile Testing",
    "Accessibility Testing",
  ],
  "Engineering Management": [
    "Performance Reviews",
    "OKRs",
    "Roadmapping",
    "Technical Strategy",
    "Conflict Resolution",
  ],
  "Cloud Engineering": [
    "Azure",
    "GCP",
    "CDN",
    "Load Balancing",
    "DNS",
    "Serverless",
  ],
  "Platform Engineering": [
    "Internal Developer Platform",
    "CI/CD",
    "Developer Experience",
    "SLOs",
    "Incident Management",
  ],
};

// ---------------------------------------------------------------------------
// Description generators  -- realistic multi-paragraph descriptions
// ---------------------------------------------------------------------------

function generateDescription(
  role: RoleTemplate,
  company: CompanyInfo
): string {
  const levelAdj: Record<string, string> = {
    junior: "early-career",
    mid: "experienced",
    senior: "highly experienced",
    staff: "deeply experienced, staff-level",
    lead: "experienced technical lead",
    manager: "seasoned engineering leader",
    director: "strategic senior leader",
  };
  const adj = levelAdj[role.level] || "experienced";

  // Build different paragraph combinations based on department
  const intros = [
    `${company.name} is looking for ${
      adj.startsWith("e") || adj.startsWith("a") ? "an" : "a"
    } ${adj} ${role.title} to join our ${role.team} team. In this role, you will play a critical part in designing, building, and shipping products that serve millions of users worldwide. You will work closely with cross-functional partners including product managers, designers, and fellow engineers to deliver high-quality solutions at scale.`,

    `We are seeking a talented ${role.title} to join the ${role.team} team at ${company.name}. This is an opportunity to work on challenging problems that impact how people interact with technology every day. You will contribute to the full lifecycle of product development, from ideation through deployment, in a collaborative and fast-paced environment.`,

    `Join ${company.name} as a ${role.title} on our ${role.team} team. You will help drive the technical direction of our products and contribute to a culture of engineering excellence. Our team values clean architecture, thorough testing, and continuous improvement, and we are looking for someone who shares that mindset.`,

    `${company.name} is hiring a ${role.title} to strengthen our ${role.team} team. In this position, you will tackle complex technical challenges, contribute to architectural decisions, and help mentor other engineers. We value thoughtful problem-solving, strong communication, and a genuine passion for building great software.`,
  ];

  const responsibilities: Record<string, string> = {
    "Software Engineering":
      "Your day-to-day responsibilities will include writing clean, well-tested code, participating in design reviews and code reviews, and collaborating with your team to deliver features on time. You will help maintain and improve existing systems, identify opportunities for technical improvement, and contribute to documentation and engineering best practices.",
    DevOps:
      "You will be responsible for building and maintaining CI/CD pipelines, managing cloud infrastructure, and ensuring high availability and reliability of production systems. You will work to automate operational processes, respond to incidents, and continuously improve our deployment and monitoring capabilities.",
    "Data Science":
      "In this role, you will design and execute experiments, build statistical and machine learning models, and translate data insights into actionable product recommendations. You will partner with product and engineering teams to define metrics, run A/B tests, and build dashboards that inform strategic decisions.",
    "Data Engineering":
      "You will design, build, and maintain scalable data pipelines and infrastructure that power analytics, machine learning, and business intelligence across the organization. You will work with stakeholders to understand data requirements, ensure data quality and reliability, and optimize performance of data systems.",
    "Machine Learning":
      "Your work will involve designing, training, and deploying machine learning models at scale. You will collaborate with research scientists and product teams to identify ML opportunities, build robust feature pipelines, and ensure models perform reliably in production environments.",
    "Mobile Development":
      "You will develop and maintain mobile applications, ensuring a smooth and performant user experience across devices. Your work will involve implementing new features, writing unit and integration tests, optimizing app performance, and collaborating with the design team on UI implementation.",
    Security:
      "You will conduct security assessments, identify vulnerabilities, and implement security controls across our applications and infrastructure. You will work with engineering teams to integrate security into the development lifecycle, respond to security incidents, and maintain compliance with industry standards.",
    "Product Management":
      "You will define product strategy, write detailed requirements, and work with engineering and design to bring features from concept to launch. You will analyze user feedback and data to prioritize the roadmap, communicate with stakeholders, and measure the success of product initiatives through clearly defined metrics.",
    Design:
      "You will lead the design process from research and wireframing through high-fidelity prototypes and final implementation review. You will conduct user research, define interaction patterns, contribute to and evolve our design system, and partner closely with engineers to ensure design intent is preserved in the final product.",
    "Quality Assurance":
      "You will develop and execute comprehensive test strategies, build and maintain automated test suites, and work with developers to identify and resolve defects early in the development cycle. You will advocate for quality across the team and help improve testing processes and tools.",
    "Engineering Management":
      "You will lead a team of engineers, providing mentorship, career development, and technical guidance. You will be responsible for hiring, setting team goals aligned with business objectives, removing blockers, facilitating agile ceremonies, and ensuring your team delivers high-quality work on schedule.",
    "Cloud Engineering":
      "You will design and manage cloud infrastructure, implement infrastructure as code, and ensure our systems are secure, reliable, and cost-effective. You will work with development teams to architect cloud-native solutions and stay current with cloud provider offerings and best practices.",
    "Platform Engineering":
      "You will build and maintain the internal developer platform, creating tools and services that enable engineering teams to ship faster and more reliably. You will define platform standards, improve developer experience, and ensure production systems meet availability and performance targets.",
  };

  const qualIntros = [
    "What we are looking for:",
    "Qualifications:",
    "About you:",
    "We would love to hear from you if you have:",
  ];

  const levelYears: Record<string, string> = {
    junior: "0-2 years",
    mid: "3-5 years",
    senior: "5-8 years",
    staff: "8+ years",
    lead: "6-10 years",
    manager: "7+ years, including 2+ years of people management",
    director: "10+ years, including 5+ years leading engineering teams",
  };

  const intro = intros[Math.floor(rand() * intros.length)];
  const respText =
    responsibilities[role.jobFunction] ||
    responsibilities["Software Engineering"];
  const qualIntro = qualIntros[Math.floor(rand() * qualIntros.length)];
  const years = levelYears[role.level] || "3+ years";
  const skillsList = role.baseSkills.slice(0, 4).join(", ");

  const qualifications = `${qualIntro}\n- ${years} of professional experience in ${role.jobFunction.toLowerCase()} or a closely related field\n- Strong proficiency with ${skillsList}\n- Excellent communication and collaboration skills\n- A track record of delivering projects with high quality and attention to detail\n- Bachelor's degree in Computer Science, Engineering, or equivalent practical experience`;

  const closing = [
    `${company.name} offers competitive compensation, comprehensive benefits, and the opportunity to work on impactful problems alongside talented colleagues. We are committed to building a diverse and inclusive workplace where everyone can do their best work.`,
    `We offer a competitive salary, equity, and benefits package. At ${company.name}, you will have the opportunity to grow your career while working on technology that reaches millions of people.`,
    `At ${company.name}, we believe in investing in our people. You will receive competitive compensation, generous equity, flexible work arrangements, and access to continuous learning opportunities.`,
  ];

  const close = closing[Math.floor(rand() * closing.length)];

  return `${intro}\n\n${respText}\n\n${qualifications}\n\n${close}`;
}

// ---------------------------------------------------------------------------
// Date generation: spread across last 30 days, weighted toward recent
// ---------------------------------------------------------------------------
function generateDatePosted(): Date {
  // 60% in last 7 days, 25% in 8-14 days, 15% in 15-30 days
  const roll = rand();
  let daysAgo: number;
  if (roll < 0.6) {
    daysAgo = randInt(0, 6);
  } else if (roll < 0.85) {
    daysAgo = randInt(7, 14);
  } else {
    daysAgo = randInt(15, 30);
  }
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(randInt(8, 20), randInt(0, 59), 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Job generation
// ---------------------------------------------------------------------------

interface SeedJob {
  externalId: string;
  site: string;
  title: string;
  companyName: string;
  companyUrl: string;
  companyLogo: string | null;
  companyIndustry: string;
  companyNumEmployees: string;
  companyDescription: string;
  jobUrl: string;
  jobUrlDirect: string | null;
  applyUrl: string;
  locationCity: string;
  locationState: string;
  locationCountry: string;
  isRemote: boolean;
  jobType: string[];
  description: string;
  skills: string[];
  department: string;
  team: string;
  employmentType: string;
  jobLevel: string;
  jobFunction: string;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  salaryInterval: string;
  salarySource: string;
  datePosted: Date;
  expiresAt: Date;
}

function generateJobs(count: number): SeedJob[] {
  const result: SeedJob[] = [];

  for (let i = 0; i < count; i++) {
    const site = pick(SITES);
    const company = pick(COMPANIES);
    const role = pick(ROLE_TEMPLATES);
    const location = pick(LOCATIONS);

    // ~40% remote
    const isRemote = rand() < 0.4;

    // Job type: 80% fulltime, 14% contract, 6% parttime
    const jtRoll = rand();
    let jobType: string[];
    let employmentType: string;
    if (jtRoll < 0.8) {
      jobType = ["fulltime"];
      employmentType = "full-time";
    } else if (jtRoll < 0.94) {
      jobType = ["contract"];
      employmentType = "contract";
    } else {
      jobType = ["parttime"];
      employmentType = "part-time";
    }

    // Salary within band, rounded to nearest $5k
    const salaryMin = roundToNearest(
      randInt(role.salaryBand[0], role.salaryBand[0] + Math.floor((role.salaryBand[1] - role.salaryBand[0]) * 0.4)),
      5
    ) * 1000;
    const salaryMax = roundToNearest(
      randInt(role.salaryBand[0] + Math.floor((role.salaryBand[1] - role.salaryBand[0]) * 0.5), role.salaryBand[1]),
      5
    ) * 1000;

    // Skills: base + 1-3 bonus from category
    const bonusPool = BONUS_SKILLS[role.jobFunction] ?? BONUS_SKILLS["Software Engineering"] ?? [];
    const bonusCount = randInt(1, 3);
    const skills = [...role.baseSkills, ...pickN(bonusPool, bonusCount)];

    // Description
    const description = generateDescription(role, company);

    // Dates
    const datePosted = generateDatePosted();
    const expiresAt = new Date(datePosted);
    expiresAt.setDate(expiresAt.getDate() + randInt(30, 60));

    // IDs
    const idx = String(i + 1).padStart(3, "0");
    const externalId = `${site.prefix}-seed-${idx}`;

    // URL helpers
    const siteUrls: Record<string, string> = {
      linkedin: "https://linkedin.com/jobs/view",
      indeed: "https://indeed.com/viewjob",
      glassdoor: "https://glassdoor.com/job-listing",
      ziprecruiter: "https://ziprecruiter.com/jobs",
      google: "https://careers.google.com/jobs/results",
    };
    const baseUrl = siteUrls[site.key] || siteUrls.linkedin;
    const slugTitle = role.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const slugCompany = company.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const jobUrl = `${baseUrl}/${slugCompany}-${slugTitle}-${externalId}`;
    const applyUrl = `${company.url}/careers/apply/${slugTitle}-${externalId}`;

    result.push({
      externalId,
      site: site.key,
      title: role.title,
      companyName: company.name,
      companyUrl: company.url,
      companyLogo: null,
      companyIndustry: company.industry,
      companyNumEmployees: company.numEmployees,
      companyDescription: company.description,
      jobUrl,
      jobUrlDirect: null,
      applyUrl,
      locationCity: isRemote ? "Remote" : location.city,
      locationState: isRemote ? null as unknown as string : location.state,
      locationCountry: "USA",
      isRemote,
      jobType,
      description,
      skills,
      department: role.department,
      team: role.team,
      employmentType,
      jobLevel: role.level,
      jobFunction: role.jobFunction,
      salaryMin: String(salaryMin),
      salaryMax: String(salaryMax),
      salaryCurrency: "USD",
      salaryInterval: "yearly",
      salarySource: "seed",
      datePosted,
      expiresAt,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function seed() {
  console.log("Seeding database with 120 realistic job listings...");

  const seedJobs = generateJobs(120);

  // Insert in batches of 30 to avoid oversized queries
  const BATCH_SIZE = 30;
  let inserted = 0;

  for (let i = 0; i < seedJobs.length; i += BATCH_SIZE) {
    const batch = seedJobs.slice(i, i + BATCH_SIZE);
    await db.insert(jobs).values(batch).onConflictDoNothing();
    inserted += batch.length;
    console.log(`  Inserted batch ${Math.ceil((i + 1) / BATCH_SIZE)} (${inserted}/${seedJobs.length} jobs)`);
  }

  // Log summary stats
  const sites = new Map<string, number>();
  const levels = new Map<string, number>();
  let remoteCount = 0;
  for (const j of seedJobs) {
    sites.set(j.site, (sites.get(j.site) || 0) + 1);
    levels.set(j.jobLevel, (levels.get(j.jobLevel) || 0) + 1);
    if (j.isRemote) remoteCount++;
  }

  console.log("\nSeed summary:");
  console.log(`  Total jobs: ${seedJobs.length}`);
  console.log(`  Remote: ${remoteCount} (${Math.round((remoteCount / seedJobs.length) * 100)}%)`);
  console.log("  By site:", Object.fromEntries(sites));
  console.log("  By level:", Object.fromEntries(levels));
  console.log("\nSeed completed successfully!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
