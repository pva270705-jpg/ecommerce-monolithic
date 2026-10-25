require('dotenv').config();
const express=require('express'),helmet=require('helmet'),cors=require('cors'),rateLimit=require('express-rate-limit'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),{z}=require('zod');
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient(),app=express(),router=express.Router();
app.disable('x-powered-by');app.use(helmet());app.use(cors());app.use(express.json({limit:'100kb'}));
app.use('/api/auth',rateLimit({windowMs:900000,limit:30}));
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const id=z.coerce.number().int().positive(),uname=z.string().trim().min(3).max(50);
const product=z.object({pname:z.string().trim().min(1).max(100),price:z.coerce.number().positive().max(99999999.99),quantity:z.coerce.number().int().min(0)});
const auth=wrap(async(req,res,next)=>{
 const [scheme,token]=(req.get('authorization')||'').split(' ');
 if(scheme!=='Bearer'||!token)return res.status(401).json({error:'Vui lòng đăng nhập.'});
 try{
  const p=jwt.verify(token,process.env.JWT_SECRET);
  req.user=await db.user.findUnique({where:{uid:Number(p.sub)},select:{uid:true,username:true,fullname:true,role:{select:{rolename:true}}}});
  if(!req.user)return res.status(401).json({error:'Tài khoản không tồn tại.'});next();
 }catch{return res.status(401).json({error:'Token không hợp lệ hoặc hết hạn.'});}
});
const admin=(req,res,next)=>req.user?.role.rolename==='ADMIN'?next():res.status(403).json({error:'Không đủ quyền.'});
router.get('/health',wrap(async(req,res)=>{await db.$queryRaw`SELECT 1`;res.json({status:'ok',database:'connected'});}));
router.post('/auth/register',wrap(async(req,res)=>{
 const d=z.object({username:uname,fullname:z.string().trim().min(1).max(100),password:z.string().min(8).max(72)}).parse(req.body);
 const [role,m]=await Promise.all([db.role.findUnique({where:{rolename:'normal'}}),db.membership.findUnique({where:{mname:'NORMAL'}})]);
 if(!role||!m)throw Object.assign(new Error('Chưa seed dữ liệu nền.'),{status:503});
 const password=await bcrypt.hash(d.password,Number(process.env.BCRYPT_ROUNDS||12));
 const user=await db.user.create({data:{...d,password,roleid:role.roleid,mid:m.mid},select:{uid:true,username:true,fullname:true}});
 res.status(201).json({user});
}));
router.post('/auth/login',wrap(async(req,res)=>{
 const d=z.object({username:uname,password:z.string().min(1)}).parse(req.body),u=await db.user.findUnique({where:{username:d.username},include:{role:true,membership:true}});
 if(!u||!await bcrypt.compare(d.password,u.password))return res.status(401).json({error:'Sai tài khoản hoặc mật khẩu.'});
 res.json({token:jwt.sign({sub:String(u.uid)},process.env.JWT_SECRET,{expiresIn:process.env.JWT_EXPIRES_IN||'1d'}),tokenType:'Bearer',user:{uid:u.uid,username:u.username,role:u.role.rolename,membership:u.membership.mname,membershipScore:u.membership.score}});
}));
router.get('/auth/me',auth,(req,res)=>res.json({user:req.user}));
router.get('/products',wrap(async(req,res)=>res.json({data:await db.product.findMany({orderBy:{pid:'asc'}})})));
router.get('/products/:id',wrap(async(req,res)=>{const p=await db.product.findUnique({where:{pid:id.parse(req.params.id)}});if(!p)return res.status(404).json({error:'Không tìm thấy sản phẩm.'});res.json({data:p});}));
router.post('/products',auth,admin,wrap(async(req,res)=>res.status(201).json({data:await db.product.create({data:product.parse(req.body)})})));
router.patch('/products/:id',auth,admin,wrap(async(req,res)=>{const d=product.partial().refine(v=>Object.keys(v).length>0).parse(req.body);res.json({data:await db.product.update({where:{pid:id.parse(req.params.id)},data:d})});}));
router.delete('/products/:id',auth,admin,wrap(async(req,res)=>{await db.product.delete({where:{pid:id.parse(req.params.id)}});res.status(204).end();}));
router.post('/orders',auth,wrap(async(req,res)=>{
 const {items}=z.object({items:z.array(z.object({pid:id,qty:z.coerce.number().int().positive()})).min(1).max(50)}).parse(req.body),qty=new Map();
 for(const i of items)qty.set(i.pid,(qty.get(i.pid)||0)+i.qty);
 const order=await db.$transaction(async tx=>{
  const ps=await tx.product.findMany({where:{pid:{in:[...qty.keys()]}}});
  if(ps.length!==qty.size)throw Object.assign(new Error('Sản phẩm không tồn tại.'),{status:400});
  for(const p of ps){const n=await tx.product.updateMany({where:{pid:p.pid,quantity:{gte:qty.get(p.pid)}},data:{quantity:{decrement:qty.get(p.pid)}}});if(!n.count)throw Object.assign(new Error('Không đủ hàng: '+p.pname),{status:409});}
  return tx.order.create({data:{uid:req.user.uid,details:{create:ps.map(p=>({pid:p.pid,qty:qty.get(p.pid),unit_price:p.price}))},shipments:{create:{status:'PENDING'}}},include:{details:{include:{product:true}},shipments:true}});
 });
 res.status(201).json({data:order});
}));
router.get('/orders',auth,wrap(async(req,res)=>res.json({data:await db.order.findMany({where:req.user.role.rolename==='ADMIN'?{}:{uid:req.user.uid},include:{details:{include:{product:true}},shipments:true},orderBy:{createat:'desc'}})})));
router.get('/orders/:id',auth,wrap(async(req,res)=>{
 const o=await db.order.findUnique({where:{oid:id.parse(req.params.id)},include:{details:{include:{product:true}},shipments:true}});
 if(!o)return res.status(404).json({error:'Không tìm thấy đơn hàng.'});
 if(o.uid!==req.user.uid&&req.user.role.rolename!=='ADMIN')return res.status(403).json({error:'Không có quyền xem đơn này.'});res.json({data:o});
}));
router.post('/orders/:id/shipments',auth,admin,wrap(async(req,res)=>{
 const oid=id.parse(req.params.id),{status}=z.object({status:z.string().trim().min(1).max(50)}).parse(req.body);
 if(!await db.order.findUnique({where:{oid},select:{oid:true}}))return res.status(404).json({error:'Không tìm thấy đơn hàng.'});
 res.status(201).json({data:await db.shipment.create({data:{oid,status}})});
}));
app.use('/api',router);app.use((req,res)=>res.status(404).json({error:'Không tìm thấy endpoint.'}));
app.use((e,req,res,next)=>{if(e.name==='ZodError')return res.status(400).json({error:'Dữ liệu không hợp lệ.',details:e.issues});if(e.code==='P2002')return res.status(409).json({error:'Giá trị đã tồn tại.'});if(e.code==='P2025')return res.status(404).json({error:'Không tìm thấy dữ liệu.'});if(e.status)return res.status(e.status).json({error:e.message});console.error(e);res.status(500).json({error:'Lỗi máy chủ nội bộ.'});});
const server=app.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('API listening on '+(process.env.PORT||3000)));
async function stop(){server.close(async()=>{await db.$disconnect();process.exit(0)});setTimeout(()=>process.exit(1),10000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
