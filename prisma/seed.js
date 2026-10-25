const {PrismaClient}=require('@prisma/client');
const bcrypt=require('bcryptjs');
const prisma=new PrismaClient();
async function main(){
 const admin=await prisma.role.upsert({where:{rolename:'ADMIN'},update:{},create:{rolename:'ADMIN'}});
 await prisma.role.upsert({where:{rolename:'normal'},update:{},create:{rolename:'normal'}});
 const basic=await prisma.membership.upsert({where:{mname:'NORMAL'},update:{score:10},create:{mname:'NORMAL',score:10}});
 await prisma.membership.upsert({where:{mname:'GOLD'},update:{},create:{mname:'GOLD',score:1000}});
 const username=process.env.ADMIN_USERNAME||'admin';
 const password=await bcrypt.hash(process.env.ADMIN_PASSWORD||'ChangeThisAdmin123!',Number(process.env.BCRYPT_ROUNDS||12));
 await prisma.user.upsert({where:{username},update:{roleid:admin.roleid,mid:basic.mid},create:{username,fullname:process.env.ADMIN_FULLNAME||'Store Admin',password,roleid:admin.roleid,mid:basic.mid}});
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
