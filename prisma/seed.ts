// V2.0: 生产环境不生成模拟数据
// 如需初始化管理员账号，请取消下方注释

// import { PrismaClient } from "@prisma/client";
// const prisma = new PrismaClient();
//
// async function main() {
//   // 可选：创建默认管理员
//   // await prisma.user.create({
//   //   data: {
//   //     name: "Admin",
//   //     email: "admin@example.com",
//   //     role: "admin",
//   //   },
//   // });
//   console.log("Seed skipped in production");
// }
//
// main()
//   .catch((e) => { console.error(e); process.exit(1); })
//   .finally(async () => { await prisma.$disconnect(); });

console.log("V2.0: Seed data disabled. No fake data will be generated.");
