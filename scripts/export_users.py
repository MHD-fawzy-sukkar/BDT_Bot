import json
import subprocess
import os
import sys
import html
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

WORKSPACE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
JSON_PATH = os.path.join(WORKSPACE_DIR, "users_data.json")
EXCEL_PATH = os.path.join(WORKSPACE_DIR, "users_data.xlsx")
HTML_PATH = os.path.join(WORKSPACE_DIR, "users_data.html")
PDF_PATH = os.path.join(WORKSPACE_DIR, "users_data.pdf")
EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

def fetch_data_from_d1():
    print("Fetching data from Cloudflare D1 via wrangler...")
    cmd = [
        "npx", "wrangler", "d1", "execute", "bdt-bot-db-eu",
        "--remote",
        '--command=SELECT username, first_name FROM bot_users',
        "--json"
    ]
    res = subprocess.run(cmd, capture_output=True, shell=True)
    if res.returncode != 0:
        err = res.stderr.decode("utf-8", errors="replace")
        print(f"Error fetching from D1: {err}")
        if os.path.exists(JSON_PATH):
            print("Falling back to existing users_data.json...")
            with open(JSON_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        raise RuntimeError("Failed to fetch D1 data and no cached json found.")
    
    raw_output = res.stdout.decode("utf-8")
    data = json.loads(raw_output)
    
    # Save clean UTF-8 JSON file
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Saved clean UTF-8 JSON to {JSON_PATH}")
    return data

def generate_excel(rows):
    print("Generating Excel file with doubled columns (2 users per row)...")
    wb = openpyxl.Workbook()
    
    # ------------------ SHEET 1: DOUBLED COLUMNS ------------------
    ws1 = wb.active
    ws1.title = "المستخدمون (مزدوج)"
    ws1.sheet_view.rightToLeft = True

    header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    header_font = Font(name="Segoe UI", size=10, bold=True, color="FFFFFF")
    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    thin_side = Side(style='thin', color='D1D5DB')
    divider_side = Side(style='medium', color='1E3A8A')

    std_border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
    col3_border = Border(left=divider_side, right=thin_side, top=thin_side, bottom=thin_side)

    row_font = Font(name="Segoe UI", size=9.5)
    alt_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    white_fill = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")

    headers_double = [
        "#", "اسم المستخدم (Username)", "الاسم الأول (First Name)",
        "#", "اسم المستخدم (Username)", "الاسم الأول (First Name)"
    ]
    ws1.append(headers_double)
    ws1.row_dimensions[1].height = 28

    for col_idx in range(1, 7):
        cell = ws1.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = header_alignment
        cell.border = col3_border if col_idx == 3 else std_border

    row_counter = 2
    for i in range(0, len(rows), 2):
        r1 = rows[i]
        idx1 = i + 1
        u1 = r1.get("username") or ""
        fn1 = r1.get("first_name") or ""

        if i + 1 < len(rows):
            r2 = rows[i + 1]
            idx2 = i + 2
            u2 = r2.get("username") or ""
            fn2 = r2.get("first_name") or ""
        else:
            idx2 = ""
            u2 = ""
            fn2 = ""

        ws1.append([idx1, u1, fn1, idx2, u2, fn2])
        ws1.row_dimensions[row_counter].height = 20
        fill = alt_fill if (row_counter % 2 == 0) else white_fill

        for col_idx, align in enumerate(["center", "left", "right", "center", "left", "right"], 1):
            c = ws1.cell(row=row_counter, column=col_idx)
            c.font = row_font
            c.fill = fill
            c.alignment = Alignment(horizontal=align, vertical="center")
            c.border = col3_border if col_idx == 3 else std_border

        row_counter += 1

    ws1.column_dimensions['A'].width = 6
    ws1.column_dimensions['B'].width = 24
    ws1.column_dimensions['C'].width = 30
    ws1.column_dimensions['D'].width = 6
    ws1.column_dimensions['E'].width = 24
    ws1.column_dimensions['F'].width = 30

    # ------------------ SHEET 2: SINGLE LIST (BACKUP/FILTERING) ------------------
    ws2 = wb.create_sheet(title="القائمة الكاملة (مفرد)")
    ws2.sheet_view.rightToLeft = True

    headers_single = ["#", "اسم المستخدم (Username)", "الاسم الأول (First Name)"]
    ws2.append(headers_single)
    ws2.row_dimensions[1].height = 28

    for col_idx in range(1, 4):
        cell = ws2.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = header_alignment
        cell.border = std_border

    for idx, r in enumerate(rows, 1):
        u = r.get("username") or ""
        fn = r.get("first_name") or ""
        row_num = idx + 1
        ws2.append([idx, u, fn])
        ws2.row_dimensions[row_num].height = 20
        fill = alt_fill if (idx % 2 == 0) else white_fill

        c1 = ws2.cell(row=row_num, column=1)
        c2 = ws2.cell(row=row_num, column=2)
        c3 = ws2.cell(row=row_num, column=3)

        c1.alignment = Alignment(horizontal="center", vertical="center")
        c2.alignment = Alignment(horizontal="left", vertical="center")
        c3.alignment = Alignment(horizontal="right", vertical="center")

        for c in (c1, c2, c3):
            c.font = row_font
            c.fill = fill
            c.border = std_border

    ws2.column_dimensions['A'].width = 8
    ws2.column_dimensions['B'].width = 28
    ws2.column_dimensions['C'].width = 36

    wb.save(EXCEL_PATH)
    print(f"Saved Excel file to: {EXCEL_PATH}")

def generate_pdf_via_html(rows):
    print("Generating HTML template for PDF with 2 users per row...")
    total_users = len(rows)
    export_date = datetime.now().strftime("%Y-%m-%d %H:%M")
    
    rows_html = []
    for i in range(0, len(rows), 2):
        r1 = rows[i]
        idx1 = i + 1
        u1 = r1.get("username")
        u1_display = f"@{html.escape(u1)}" if u1 else '<span class="no-user">-</span>'
        fn1 = html.escape(r1.get("first_name") or "")

        if i + 1 < len(rows):
            r2 = rows[i + 1]
            idx2 = str(i + 2)
            u2 = r2.get("username")
            u2_display = f"@{html.escape(u2)}" if u2 else '<span class="no-user">-</span>'
            fn2 = html.escape(r2.get("first_name") or "")
        else:
            idx2 = '<span class="no-user">-</span>'
            u2_display = '<span class="no-user">-</span>'
            fn2 = '<span class="no-user">-</span>'

        rows_html.append(f"""
        <tr>
            <td class="col-num">{idx1}</td>
            <td class="col-user" dir="ltr">{u1_display}</td>
            <td class="col-name divider-left">{fn1}</td>
            <td class="col-num">{idx2}</td>
            <td class="col-user" dir="ltr">{u2_display}</td>
            <td class="col-name">{fn2}</td>
        </tr>
        """)
        
    html_content = f"""<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>قائمة مستخدمي البوت - BDT Bot</title>
    <style>
        @page {{
            size: A4;
            margin: 10mm 8mm;
            @bottom-left {{
                content: "الصفحة " counter(page) " من " counter(pages);
                font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
                font-size: 8pt;
                color: #64748b;
                direction: rtl;
            }}
            @bottom-right {{
                content: "BDT Bot - قاعدة بيانات المستخدمين (عمودان مزدوجان)";
                font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
                font-size: 8pt;
                color: #94a3b8;
                direction: rtl;
            }}
        }}
        
        * {{
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }}
        
        body {{
            font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
            background-color: #ffffff;
            color: #0f172a;
            margin: 0;
            padding: 0;
            font-size: 8.5pt;
            line-height: 1.35;
        }}
        
        .header-card {{
            background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
            color: white;
            padding: 12px 18px;
            border-radius: 6px;
            margin-bottom: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        
        .header-title h1 {{
            margin: 0 0 3px 0;
            font-size: 15pt;
            font-weight: 700;
        }}
        
        .header-title p {{
            margin: 0;
            font-size: 8.5pt;
            opacity: 0.85;
        }}
        
        .stats-badge {{
            background: rgba(255, 255, 255, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.35);
            padding: 6px 14px;
            border-radius: 5px;
            text-align: center;
        }}
        
        .stats-badge .count {{
            font-size: 14pt;
            font-weight: bold;
            display: block;
        }}
        
        .stats-badge .label {{
            font-size: 7.5pt;
            opacity: 0.9;
        }}
        
        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 8pt;
            table-layout: fixed;
        }}
        
        thead {{
            display: table-header-group;
        }}
        
        tr {{
            page-break-inside: avoid;
        }}
        
        th {{
            background-color: #1e3a8a;
            color: #ffffff;
            font-weight: 600;
            padding: 6px 6px;
            border: 1px solid #1e3a8a;
            font-size: 7.8pt;
        }}
        
        th.col-num {{
            text-align: center;
            width: 4.5%;
        }}
        
        th.col-user {{
            text-align: left;
            width: 19.5%;
        }}
        
        th.col-name {{
            text-align: right;
            width: 26%;
        }}

        th.divider-left {{
            border-left: 2.5px solid #ffffff !important;
        }}
        
        td {{
            padding: 4px 6px;
            border: 1px solid #e2e8f0;
            vertical-align: middle;
            overflow: hidden;
            text-overflow: ellipsis;
        }}
        
        td.col-num {{
            text-align: center;
            color: #64748b;
            font-weight: 600;
            font-size: 7.5pt;
        }}
        
        td.col-user {{
            text-align: left;
            font-family: 'Consolas', 'Courier New', monospace;
            color: #1e40af;
            font-size: 7.5pt;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }}
        
        td.col-name {{
            text-align: right;
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }}

        td.divider-left {{
            border-left: 2.5px solid #94a3b8 !important;
        }}
        
        tr:nth-child(even) td {{
            background-color: #f8fafc;
        }}
        
        .no-user {{
            color: #94a3b8;
            font-style: italic;
            font-family: 'Segoe UI', Tahoma, sans-serif;
        }}
        
        .footer {{
            margin-top: 12px;
            font-size: 7.5pt;
            color: #64748b;
            text-align: center;
            padding-top: 6px;
            border-top: 1px solid #e2e8f0;
        }}
    </style>
</head>
<body>
    <div class="header-card">
        <div class="header-title">
            <h1>سجل مستخدمي البوت (BDT Bot)</h1>
            <p>تاريخ التصدير: {export_date} &bull; قاعدة البيانات: bdt-bot-db-eu &bull; عرض مزدوج (مستخدمين بكل سطر)</p>
        </div>
        <div class="stats-badge">
            <span class="count">{total_users}</span>
            <span class="label">إجمالي المشتركين</span>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th class="col-num">#</th>
                <th class="col-user">اسم المستخدم (Username)</th>
                <th class="col-name divider-left">الاسم الأول (First Name)</th>
                <th class="col-num">#</th>
                <th class="col-user">اسم المستخدم (Username)</th>
                <th class="col-name">الاسم الأول (First Name)</th>
            </tr>
        </thead>
        <tbody>
            {"".join(rows_html)}
        </tbody>
    </table>
    
    <div class="footer">
        تم استخراج هذا التقرير آلياً من قاعدة بيانات BDT Bot &bull; إجمالي المشتركين: {total_users}
    </div>
</body>
</html>
"""
    with open(HTML_PATH, "w", encoding="utf-8") as f:
        f.write(html_content)
    print(f"Saved HTML to: {HTML_PATH}")

    if not os.path.exists(EDGE_PATH):
        raise FileNotFoundError(f"Microsoft Edge not found at {EDGE_PATH}")
    
    print("Converting HTML to PDF via Microsoft Edge headless...")
    html_file_url = f"file:///{HTML_PATH.replace(os.sep, '/')}"
    cmd = [
        EDGE_PATH,
        "--headless",
        "--disable-gpu",
        "--run-all-compositor-stages-before-draw",
        f"--print-to-pdf={PDF_PATH}",
        "--no-pdf-header-footer",
        html_file_url
    ]
    res = subprocess.run(cmd, capture_output=True)
    if res.returncode != 0:
        print("Warning: Edge returned non-zero:", res.stderr.decode("utf-8", errors="replace"))
    
    if os.path.exists(PDF_PATH) and os.path.getsize(PDF_PATH) > 0:
        print(f"Generated PDF successfully: {PDF_PATH} ({os.path.getsize(PDF_PATH)} bytes)")
        # Clean up temporary HTML file so only final exports remain
        try:
            if os.path.exists(HTML_PATH):
                os.remove(HTML_PATH)
                print("Cleaned up temporary HTML template.")
        except Exception:
            pass
    else:
        raise RuntimeError("PDF generation failed: file is missing or empty.")

def main():
    data = fetch_data_from_d1()
    rows = data[0]["results"]
    print(f"Total rows retrieved: {len(rows)}")
    
    generate_excel(rows)
    generate_pdf_via_html(rows)
    print("All tasks completed successfully!")

if __name__ == "__main__":
    main()
