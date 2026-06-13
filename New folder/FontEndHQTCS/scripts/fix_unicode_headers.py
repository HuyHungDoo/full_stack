"""Remove duplicate in-page titles and repair U+FFFD in useSetPageHeader (ASCII-only source)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Vietnamese literals via escapes to avoid editor encoding issues
MED_BLOCK = (
    '      <div className="flex items-end justify-between border-b border-slate-100 pb-4">\n'
    "        <div>\n"
    '          <h1 className="text-3xl font-bold text-slate-900">'
    "Qu\u1ea3n l\xfd thu\u1ed1c</h1>\n"
    '          <p className="mt-1 text-sm text-slate-500">\n'
    "            Qu\u1ea3n l\xfd danh m\u1ee5c thu\u1ed1c, t\u1ed3n kho, gi\xe1 b\xe1n v\xe0 "
    "th\xf4ng tin chi ti\u1ebft\n"
    "          </p>\n"
    "        </div>\n"
    "      </div>\n"
    "\n"
)

INV_BAD_HOOK = (
    "useSetPageHeader('Ki\u1ec3m tra t\ufffd\ufffdn kho', "
    "'Tra c\ufffd\ufffdu t\ufffd\ufffdn kho thu\u1ed1c realtime')"
)
INV_GOOD_HOOK = (
    "useSetPageHeader('Ki\u1ec3m tra t\u1ed3n kho', "
    "'Tra c\u1ee9u t\u1ed3n kho thu\u1ed1c realtime')"
)

INV_BLOCK = (
    '      <div className="border-b border-slate-100 pb-4">\n'
    '        <h1 className="text-3xl font-bold text-slate-900">'
    "Ki\u1ec3m tra t\u1ed3n kho</h1>\n"
    '        <p className="mt-1 text-sm text-slate-500">'
    "Tra c\u1ee9u t\u1ed3n kho thu\u1ed1c realtime</p>\n"
    "      </div>\n"
    "\n"
)

ADMIN_BAD = (
    "    'T\ufffd\ufffdng quan',\n"
    "    'Theo d\xf5i doanh thu, t\ufffd\ufffdn kho, \u0111\u01a1n h\xe0ng v\xe0 "
    "hi\u1ec7u su\u1ea5t ho\u1ea1t \u0111\u1ed9ng',"
)
ADMIN_GOOD = (
    "    'T\u1ed5ng quan',\n"
    "    'Theo d\xf5i doanh thu, t\u1ed3n kho, \u0111\u01a1n h\xe0ng v\xe0 "
    "hi\u1ec7u su\u1ea5t ho\u1ea1t \u0111\u1ed9ng',"
)

STAFF_BAD_HOOK = "    'T\ufffd\ufffdng quan b\xe1n h\xe0ng',"
STAFF_GOOD_HOOK = "    'T\u1ed5ng quan b\xe1n h\xe0ng',"

STAFF_BLOCK = (
    "      {/* HEADER */}\n"
    '      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 '
    "md:flex-row md:items-end md:justify-between\">\n"
    "        <div>\n"
    '          <h1 className="text-3xl font-bold text-slate-900">'
    "T\u1ed5ng quan b\xe1n h\xe0ng</h1>\n"
    '          <p className="mt-1 text-sm text-slate-500">\n'
    "            Theo d\xf5i ti\u1ebfn \u0111\u1ed9 b\xe1n h\xe0ng v\xe0 c\xf4ng "
    "vi\u1ec7c trong ng\xe0y c\u1ee7a b\u1ea1n\n"
    "          </p>\n"
    "        </div>\n"
    "      </div>\n"
    "\n"
)

SALES_BAD_HOOK = (
    "useSetPageHeader('B\xe1n h\xe0ng t\u1ea1i qu\u1ea7y', "
    "'T\xecm ki\u1ebfm s\u1ea3n ph\ufffd\ufffdm v\xe0 thanh to\xe1n nhanh ch\xf3ng')"
)
SALES_GOOD_HOOK = (
    "useSetPageHeader('B\xe1n h\xe0ng t\u1ea1i qu\u1ea7y', "
    "'T\xecm ki\u1ebfm s\u1ea3n ph\u1ea9m v\xe0 thanh to\xe1n nhanh ch\xf3ng')"
)

SALES_BLOCK = (
    '      <div className="flex items-center justify-between border-b border-slate-100 pb-4">\n'
    "        <div>\n"
    '          <h1 className="text-3xl font-bold text-slate-900">'
    "B\xe1n h\xe0ng t\u1ea1i qu\u1ea7y</h1>\n"
    '          <p className="mt-1 text-sm text-slate-500">'
    "T\xecm ki\u1ebfm s\u1ea3n ph\u1ea9m v\xe0 thanh to\xe1n nhanh ch\xf3ng</p>\n"
    "        </div>\n"
    "      </div>\n"
    "\n"
)


def main() -> None:
    med = ROOT / "src/pages/admin/Medicines.jsx"
    t = med.read_text(encoding="utf-8")
    if MED_BLOCK in t:
        med.write_text(t.replace(MED_BLOCK, "", 1), encoding="utf-8")
        print("Medicines: removed duplicate header")
    else:
        print("Medicines: skip")

    inv = ROOT / "src/components/common/Inventory.jsx"
    t = inv.read_text(encoding="utf-8")
    if INV_BAD_HOOK in t:
        t = t.replace(INV_BAD_HOOK, INV_GOOD_HOOK, 1)
    if INV_BLOCK in t:
        t = t.replace(INV_BLOCK, "", 1)
    inv.write_text(t, encoding="utf-8")
    print("Inventory: done")

    admin = ROOT / "src/pages/admin/AdminHome.jsx"
    t = admin.read_text(encoding="utf-8")
    if ADMIN_BAD in t:
        t = t.replace(ADMIN_BAD, ADMIN_GOOD, 1)
    admin.write_text(t, encoding="utf-8")
    print("AdminHome: done")

    staff = ROOT / "src/pages/staff/StaffHome.jsx"
    t = staff.read_text(encoding="utf-8")
    if STAFF_BAD_HOOK in t:
        t = t.replace(STAFF_BAD_HOOK, STAFF_GOOD_HOOK, 1)
    if STAFF_BLOCK in t:
        t = t.replace(STAFF_BLOCK, "", 1)
    staff.write_text(t, encoding="utf-8")
    print("StaffHome: done")

    sales = ROOT / "src/pages/staff/Sales.jsx"
    t = sales.read_text(encoding="utf-8")
    if SALES_BAD_HOOK in t:
        t = t.replace(SALES_BAD_HOOK, SALES_GOOD_HOOK, 1)
    if SALES_BLOCK in t:
        t = t.replace(SALES_BLOCK, "", 1)
    sales.write_text(t, encoding="utf-8")
    print("Sales: done")


if __name__ == "__main__":
    main()
