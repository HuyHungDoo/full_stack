from pathlib import Path

p = Path(__file__).resolve().parent.parent / "src" / "pages" / "admin" / "Employees.jsx"
lines = p.read_text(encoding="utf-8").splitlines(keepends=True)
out = []
for line in lines:
    out.append(line)
    if line.strip() == "export default function Employees() {":
        out.append(
            "  useSetPageHeader(\n"
            "    'Quản lý nhân viên',\n"
            "    'Tạo, sửa, xóa tài khoản và phân quyền truy cập hệ thống',\n"
            "  )\n\n"
        )
p.write_text("".join(out), encoding="utf-8")
print("employees ok")
