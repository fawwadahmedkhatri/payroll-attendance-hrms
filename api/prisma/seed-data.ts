// Static sample data for the seed. Everything here is editable later from the Settings screens.

export const FIRST_NAMES = [
  "Aarav", "Aditi", "Ahmed", "Aisha", "Akira", "Alejandro", "Amara", "Amit", "Ana", "Ananya",
  "Arjun", "Ayesha", "Bilal", "Camila", "Carlos", "Chen", "Chloe", "Daniel", "David", "Deepa",
  "Diego", "Divya", "Elena", "Emma", "Ethan", "Fatima", "Gabriel", "Grace", "Hana", "Hassan",
  "Ishaan", "Isabella", "Jacob", "James", "Kavya", "Kenji", "Khalid", "Lakshmi", "Layla", "Leo",
  "Lucas", "Maria", "Maya", "Meera", "Mei", "Mohammed", "Neha", "Nikhil", "Noah", "Nora",
  "Olivia", "Omar", "Priya", "Rahul", "Ravi", "Rohan", "Sara", "Sakura", "Samuel", "Sanjay",
  "Sneha", "Sofia", "Tanvi", "Thomas", "Varun", "Vikram", "Wei", "Yusuf", "Zara", "Zoe",
];

export const LAST_NAMES = [
  "Agarwal", "Ahmed", "Ali", "Bose", "Brown", "Chen", "Costa", "Das", "Desai", "Fernandes",
  "Garcia", "Gupta", "Hernandez", "Iyer", "Jain", "Johnson", "Joshi", "Kapoor", "Khan", "Kim",
  "Kumar", "Lee", "Lopez", "Malik", "Martin", "Mehta", "Menon", "Mishra", "Nair", "Nakamura",
  "Patel", "Pereira", "Pillai", "Rao", "Reddy", "Rossi", "Saxena", "Shah", "Sharma", "Silva",
  "Singh", "Smith", "Tanaka", "Thomas", "Verma", "Wang", "Williams", "Wilson", "Yadav", "Zhang",
];

export const DEPARTMENTS: { code: string; name: string; weight: number }[] = [
  { code: "ENG", name: "Engineering", weight: 22 },
  { code: "OPS", name: "Operations", weight: 18 },
  { code: "SAL", name: "Sales", weight: 14 },
  { code: "CS", name: "Customer Support", weight: 12 },
  { code: "FIN", name: "Finance & Accounts", weight: 7 },
  { code: "HR", name: "Human Resources", weight: 5 },
  { code: "MKT", name: "Marketing", weight: 7 },
  { code: "QA", name: "Quality Assurance", weight: 7 },
  { code: "ADM", name: "Administration", weight: 4 },
  { code: "IT", name: "IT Infrastructure", weight: 4 },
];

/** Designation with a monthly base salary range. */
export const DESIGNATIONS: { title: string; min: number; max: number; weight: number }[] = [
  { title: "Trainee", min: 15000, max: 20000, weight: 8 },
  { title: "Associate", min: 20000, max: 32000, weight: 30 },
  { title: "Senior Associate", min: 32000, max: 48000, weight: 24 },
  { title: "Team Lead", min: 48000, max: 70000, weight: 14 },
  { title: "Assistant Manager", min: 60000, max: 85000, weight: 10 },
  { title: "Manager", min: 85000, max: 120000, weight: 9 },
  { title: "Senior Manager", min: 120000, max: 160000, weight: 4 },
  { title: "Director", min: 160000, max: 250000, weight: 1 },
];

export const BANKS = ["First National Bank", "City Savings Bank", "Metro Commercial Bank", "United Trust Bank", "Global Bank"];
