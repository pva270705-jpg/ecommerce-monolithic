# E-commerce Monolithic API — Prompt 2

REST API MVP theo sơ đồ database, đồng thời có checklist thực hành bám đủ 8 tiêu chí phiếu chấm.

## 1. Cấu trúc Monolithic
Một Express API duy nhất xử lý auth, products, orders, shipments; các chức năng cùng deploy trong container API, dùng chung Prisma Client và PostgreSQL. `src/index.js` chứa routes/middleware/nghiệp vụ; `prisma/` chứa schema, migration, seed và tiện ích CLI; Docker Compose quản lý API + DB.

**Đánh giá:** một deployable API và một database; phù hợp kiến trúc Monolithic.

## 2. .gitignore, .env và GitHub
`.env` chứa cấu hình local và được ignore. Commit `.env.example` để mô tả biến cần thiết, tuyệt đối không commit secret/mật khẩu thật. Trước khi chạy, đổi `JWT_SECRET`, `ADMIN_PASSWORD` và `POSTGRES_PASSWORD`. Nếu cổng máy 5432 đang bận, đặt `POSTGRES_PORT=5433` (hoặc cổng trống khác).

**Đánh giá:** kiểm tra `git status --ignored`, .env phải bị ignore và không có secret thật trên GitHub.

## 3. Prisma ORM
`schema.prisma` mô tả models, kiểu cột, quan hệ và khóa; migration SQL áp schema lên PostgreSQL; Prisma Client cung cấp truy vấn model như `db.order.findMany()`; seed tạo role, membership và admin. OrderDetail có khóa ghép (oid,pid).

**Đánh giá:** đủ Role, User, Membership, Product, Order, OrderDetail, Shipment như ERD. Khi đổi schema: `npx prisma migrate dev --name ten_migration`.

## 4. Compose, health check, container
```sh
docker compose up --build -d
docker compose ps
docker compose logs api
```
Compose dùng `POSTGRES_PASSWORD` đã khai báo trong `.env`, chờ PostgreSQL healthy, chạy migration + seed idempotent (`upsert`) rồi khởi động API. Dockerfile cài OpenSSL và dùng `npm ci` theo lockfile. DB healthcheck dùng pg_isready; API healthcheck gọi /api/health và endpoint kiểm tra kết nối DB.

**Đánh giá:** `docker compose ps` hiển thị api và db healthy; `curl http://localhost:3000/api/health` trả status ok/database connected.

## 5. Kiểm tra DB và tạo sản phẩm X/Y bằng CLI
```sh
docker compose exec db psql -U ecommerce -d ecommerce -c "\dt"
docker compose exec api node prisma/create-products.js
docker compose exec db psql -U ecommerce -d ecommerce -c 'SELECT pid,pname,price,quantity FROM "Product" ORDER BY pid;'
```
Script tạo hoặc cập nhật X (100.00) và Y (250.00), tồn kho 100.

**Đánh giá:** có đủ bảy bảng; query Product hiện X và Y.

## 6. Postman: đăng ký, đăng nhập
1. POST /api/auth/register, JSON: `{"username":"normal01","fullname":"Normal User","password":"MatKhau123"}`.
2. API tự gán role normal và membership NORMAL với score 10.
3. POST /api/auth/login với tài khoản vừa tạo; lưu token trả về.
4. Request cần xác thực gửi `Authorization: Bearer <token>`.

**Đánh giá:** password không trả về; DB xác nhận role normal / score 10; login hiện JWT token.

## 7. Postman: đặt hàng, Shipment
1. POST /api/orders không token — phải trả 401.
2. Có token, gửi `{"items":[{"pid":<pid_X>,"qty":2},{"pid":<pid_Y>,"qty":5}]}`.
3. API tạo Order với thời gian hiện tại, OrderDetail lưu qty và giá mua, trừ tồn kho trong transaction, tự tạo Shipment trạng thái PENDING.
4. Response chứa order/details/shipments; GET /api/orders/:id đọc lại thông tin.

**Đánh giá:** thiếu token bị chặn; đặt hàng thành công trả thông tin Shipment.

Import file `postman/Prompt2.postman_collection.json` vào Postman. Chạy lần lượt các request từ mục 1 đến 6; collection tự tạo username mới, lưu JWT và Product IDs, đồng thời kiểm tra các response chính.

## 8. CLI: đối chiếu dữ liệu sau đặt hàng
```sh
docker compose exec db psql -U ecommerce -d ecommerce -c 'SELECT * FROM "Order" ORDER BY oid DESC;'
docker compose exec db psql -U ecommerce -d ecommerce -c 'SELECT * FROM "OrderDetail" ORDER BY oid DESC;'
docker compose exec db psql -U ecommerce -d ecommerce -c 'SELECT pid,pname,quantity FROM "Product" ORDER BY pid;'
docker compose exec db psql -U ecommerce -d ecommerce -c 'SELECT * FROM "Shipment" ORDER BY shipid DESC;'
```
**Đánh giá:** order/detail đã tạo; tồn X giảm 2, Y giảm 5; shipment PENDING gắn đúng oid.

## Khởi chạy
Sửa .env, sau đó `docker compose up --build -d`. Dừng bằng `docker compose down` (giữ volume); chỉ thêm `-v` nếu chủ ý xóa DB local.

## Endpoint
- GET /api/health; POST /api/auth/register, /api/auth/login; GET /api/auth/me.
- GET /api/products, GET /api/products/:id (public).
- POST/PATCH/DELETE /api/products/:id (ADMIN).
- POST /api/orders (JWT); GET /api/orders và /api/orders/:id (khách chỉ thấy đơn của mình).
- POST /api/orders/:id/shipments (ADMIN, cập nhật thêm trạng thái sau này).

MVP chưa gồm thanh toán, refresh token, email hoặc hoàn/hủy đơn có hoàn kho.
