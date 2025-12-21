
import React, { useState, useEffect, useRef } from 'react';

interface EmployeeRecord {
  name: string;
  fridays: string;
  overtime: number;
  absent: string;
  sick: string;
  notes: string;
  [key: string]: any; // For custom columns
}

const STORAGE_KEY = "aj_xray_overtime_2025";

const LegacyOvertimeSystem: React.FC = () => {
  // --- State ---
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [customColumns, setCustomColumns] = useState<string[]>([]);
  const [editIndex, setEditIndex] = useState<number>(-1);
  
  // Form State
  const [formData, setFormData] = useState<EmployeeRecord>({
    name: '', fridays: '5', overtime: 0, absent: '', sick: '', notes: ''
  });
  
  const [month, setMonth] = useState('');
  const [search, setSearch] = useState('');

  // --- Effects ---
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const data = JSON.parse(raw);
        setEmployees(data.employees || []);
        setCustomColumns(data.customColumns || []);
      } catch (e) {}
    }
    
    // Set default month
    const now = new Date();
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    setMonth(`${months[now.getMonth()]} ${now.getFullYear()}`);
  }, []);

  const saveToStorage = (newEmployees: EmployeeRecord[], newCols: string[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ employees: newEmployees, customColumns: newCols }));
  };

  // --- Handlers ---
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: id === 'overtime' ? Number(value) : value }));
  };

  const handleAddOrSave = () => {
    if (!formData.name) return alert("Please enter employee name");
    
    const newEmployees = [...employees];
    if (editIndex === -1) {
      newEmployees.push({ ...formData });
    } else {
      newEmployees[editIndex] = { ...formData };
      setEditIndex(-1);
    }
    
    setEmployees(newEmployees);
    saveToStorage(newEmployees, customColumns);
    setFormData({ name: '', fridays: '5', overtime: 0, absent: '', sick: '', notes: '' });
  };

  const handleEdit = (index: number) => {
    setFormData({ ...employees[index] });
    setEditIndex(index);
    window.scrollTo({ top: document.getElementById('legacy-form')?.offsetTop || 0, behavior: 'smooth' });
  };

  const handleDelete = (index: number) => {
    if (!confirm("Do you want to delete this record?")) return;
    const newEmployees = employees.filter((_, i) => i !== index);
    setEmployees(newEmployees);
    saveToStorage(newEmployees, customColumns);
  };

  const handleAddColumn = () => {
    const colName = prompt("Enter custom column name:");
    if (!colName) return;
    if (customColumns.includes(colName)) return alert("Column exists!");
    const newCols = [...customColumns, colName];
    setCustomColumns(newCols);
    saveToStorage(employees, newCols);
  };

  const handleClearColumns = () => {
    if (confirm("Remove ALL custom columns?")) {
      setCustomColumns([]);
      // Cleanup data
      const cleaned = employees.map(e => {
        const newE = { ...e };
        customColumns.forEach(c => delete newE[c]);
        return newE;
      });
      setEmployees(cleaned);
      saveToStorage(cleaned, []);
    }
  };

  const handleUpdateCustom = (index: number, col: string, val: string) => {
    const newEmployees = [...employees];
    newEmployees[index] = { ...newEmployees[index], [col]: val };
    setEmployees(newEmployees);
    saveToStorage(newEmployees, customColumns);
  };

  // --- Export/Import ---
  const exportJSON = () => {
    const data = { employees, customColumns };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Overtime_${month.replace(' ', '_')}.json`;
    a.click();
  };

  const importJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target?.result as string);
        if (Array.isArray(data.employees)) {
          setEmployees(data.employees);
          setCustomColumns(data.customColumns || []);
          saveToStorage(data.employees, data.customColumns || []);
          alert("Imported successfully");
        }
      } catch (err) { alert("Invalid file"); }
    };
    reader.readAsText(file);
  };

  // --- Printing (Exact HTML from Request) ---
  const handlePrint = () => {
    const tillDate = prompt("Enter the date till (e.g. 25/10/2025):", "");
    const tillText = tillDate ? `TILL ${tillDate}` : "";
    const totalOvertime = employees.reduce((acc, curr) => acc + (Number(curr.overtime) || 0), 0);

    const rows = employees.map((e, i) => `
      <tr>
        <td>${i + 1}</td>
        <td style="text-align:left">${e.name || ''}</td>
        <td>${e.fridays || ''}</td>
        <td>${e.overtime || 0}</td>
        <td>${e.absent || ''}</td>
        <td>${e.sick || ''}</td>
        ${customColumns.map(c => `<td>${e[c] || ''}</td>`).join("")}
        <td>${e.notes || ''}</td>
      </tr>
    `).join("");

    const customHeaders = customColumns.map(c => `<th>${c.toUpperCase()}</th>`).join("");
    const colSpan = 8 + customColumns.length;

    const html = `
      <html lang="en" dir="ltr">
      <head>
        <meta charset="utf-8">
        <title>Print Report</title>
        <style>
          @page { size: A4 landscape; margin: 15mm; }
          body { font-family:"Segoe UI","Tajawal",Arial,sans-serif; font-size:12px; color:#111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          table { width:100%; border-collapse:collapse; margin-top:8px; font-size:12px; }
          th, td { padding:6px 8px; border:1px solid #000000; text-align:center; font-weight: 700; }
          td:nth-child(2){ text-align:left; }
          th { background:#f0f8ff; color:#0b5ea8; font-weight: 900; text-transform: uppercase; }
          .page-header { margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; }
          .logo { width:60px; height:60px; border-radius:8px; display:flex; justify-content:center; align-items:center; font-weight:800; font-size:22px; color:white; background:linear-gradient(135deg,#0b5ea8,#2a9df4); text-transform: uppercase; }
          .header-text-left { margin-left:15px; text-transform: uppercase; }
          .header-text-left h1 { margin:0; font-size:26px; color:#0b5ea8; font-weight:800; }
          .header-text-left h2 { margin:2px 0 0; font-size:18px; color:#2a9df4; font-weight:700; }
          .header-text-right { text-align:right; text-transform: uppercase; }
          .header-text-right h2 { margin:0; font-size:22px; color:#0b5ea8; font-weight:800; }
          .header-text-right div { margin-top:4px; font-size:16px; color:#444; font-weight:600; }
          .signatures { display:flex; justify-content:space-between; font-weight:600; margin-top:40px; }
          tr:nth-child(even) { background-color:#f0f8ff; }
        </style>
      </head>
      <body>
        <table>
          <thead>
            <tr>
              <th colspan="${colSpan}" style="border:none; padding-bottom:12px; background:white;">
                <div class="page-header">
                  <div style="display:flex; align-items:center;">
                    <div class="logo">AJ</div>
                    <div class="header-text-left">
                      <h1>AL-JEDAANI HOSPITAL - IBN SINA</h1>
                      <h2>RADIOLOGY DEPARTMENT</h2>
                    </div>
                  </div>
                  <div class="header-text-right">
                    <h2>STAFF OVERTIME</h2>
                    <h2>${tillText}</h2>
                    <div>${month.toUpperCase()}</div>
                  </div>
                </div>
              </th>
            </tr>
            <tr>
              <th>#</th>
              <th>NAME</th>
              <th>FRIDAYS</th>
              <th>OVERTIME HOURS</th>
              <th>ABSENCE / DELAY</th>
              <th>SICK LEAVE</th>
              ${customHeaders}
              <th>NOTES</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
               <td colspan="${colSpan}" style="border:none; padding:10px; text-align:left; background:#fff;">
                  <div style="font-size:14px;">TOTAL EMPLOYEES: ${employees.length} | TOTAL OVERTIME: ${totalOvertime} HRS</div>
               </td>
            </tr>
            <tr>
              <td colspan="${colSpan}" style="border:none; padding-top:20px; background:white;">
                <div class="signatures">
                  <div style="text-align:center;">_________________________<br>HEAD OF DEPARTMENT</div>
                  <div style="text-align:center;">_________________________<br>MEDICAL DIRECTOR</div>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </body>
      </html>
    `;

    const w = window.open("", "_blank");
    if (w) {
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 500);
    }
  };

  const filteredEmployees = employees.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));
  const totalOvertime = employees.reduce((acc, curr) => acc + (Number(curr.overtime) || 0), 0);

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden font-sans mt-8 animate-fade-in-up">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-sky-500 p-6 text-white flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white text-blue-700 rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg">AJ</div>
          <div>
            <h1 className="text-2xl font-black">نظام الأوفر تايم</h1>
            <p className="text-blue-100 opacity-90">Al-Jedaani Hospital - Radiology Department</p>
          </div>
        </div>
        <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20 text-center">
            <div className="text-2xl font-black">{employees.length}</div>
            <div className="text-xs font-bold uppercase opacity-80">Employees</div>
        </div>
      </div>

      <div className="p-6 bg-slate-50" id="legacy-form">
        {/* Form */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
                <div className="col-span-1 md:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 mb-1">Employee Name</label>
                    <input id="name" type="text" className="w-full p-2.5 border rounded-lg bg-slate-50 text-sm font-bold" placeholder="e.g. Nazem" value={formData.name} onChange={handleInputChange} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Fridays</label>
                    <input id="fridays" type="number" className="w-full p-2.5 border rounded-lg bg-slate-50 text-sm" value={formData.fridays} onChange={handleInputChange} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Overtime</label>
                    <input id="overtime" type="number" className="w-full p-2.5 border rounded-lg bg-slate-50 text-sm" value={formData.overtime} onChange={handleInputChange} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Absence</label>
                    <input id="absent" type="text" className="w-full p-2.5 border rounded-lg bg-slate-50 text-sm" placeholder="Details..." value={formData.absent} onChange={handleInputChange} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Sick Leave</label>
                    <input id="sick" type="text" className="w-full p-2.5 border rounded-lg bg-slate-50 text-sm" placeholder="Days..." value={formData.sick} onChange={handleInputChange} />
                </div>
                <div className="col-span-1 md:col-span-2 lg:col-span-4">
                    <label className="block text-xs font-bold text-slate-500 mb-1">Notes</label>
                    <input id="notes" type="text" className="w-full p-2.5 border rounded-lg bg-slate-50 text-sm" placeholder="Additional notes..." value={formData.notes} onChange={handleInputChange} />
                </div>
                <div className="col-span-1 md:col-span-1 lg:col-span-2 flex gap-2">
                    <button onClick={handleAddOrSave} className="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-lg hover:bg-blue-700 transition shadow-lg shadow-blue-200">
                        {editIndex === -1 ? 'Add Record' : 'Update Record'}
                    </button>
                    <button onClick={() => { setEditIndex(-1); setFormData({ name: '', fridays: '5', overtime: 0, absent: '', sick: '', notes: '' }) }} className="px-4 bg-gray-100 text-gray-600 font-bold rounded-lg hover:bg-gray-200 transition">
                        Cancel
                    </button>
                </div>
            </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
            <div className="flex flex-wrap gap-2">
                <button onClick={handlePrint} className="bg-slate-800 text-white px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-slate-700">
                    <i className="fas fa-print"></i> Print Report
                </button>
                <button onClick={handleAddColumn} className="bg-white border border-slate-300 text-slate-600 px-4 py-2 rounded-lg font-bold text-xs hover:bg-slate-50">
                    <i className="fas fa-columns mr-1"></i> Add Column
                </button>
                {customColumns.length > 0 && (
                    <button onClick={handleClearColumns} className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg font-bold text-xs hover:bg-red-100">
                        <i className="fas fa-trash mr-1"></i> Clear Columns
                    </button>
                )}
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
                <select className="bg-white border border-slate-200 text-slate-700 text-xs font-bold py-2 px-3 rounded-lg outline-none" value={month} onChange={e => setMonth(e.target.value)}>
                    {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map(m => (
                        <option key={m} value={`${m} ${new Date().getFullYear()}`}>{m} {new Date().getFullYear()}</option>
                    ))}
                </select>
                <button onClick={exportJSON} className="bg-emerald-600 text-white px-3 py-2 rounded-lg font-bold text-xs hover:bg-emerald-700">Export JSON</button>
                <label className="bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-lg font-bold text-xs cursor-pointer hover:bg-slate-50">
                    Import JSON <input type="file" accept=".json" className="hidden" onChange={importJSON} />
                </label>
            </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
            <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <input 
                    className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs w-64 outline-none focus:ring-2 focus:ring-blue-100"
                    placeholder="Search employees..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <div className="text-xs font-bold text-slate-500">Total Overtime: <span className="text-blue-600 text-sm">{totalOvertime}</span> hrs</div>
            </div>
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-100 text-slate-500 text-xs uppercase font-bold">
                    <tr>
                        <th className="px-4 py-3">#</th>
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Fridays</th>
                        <th className="px-4 py-3">Overtime</th>
                        <th className="px-4 py-3">Absence</th>
                        <th className="px-4 py-3">Sick Leave</th>
                        {customColumns.map(c => <th key={c} className="px-4 py-3 bg-blue-50 text-blue-600">{c}</th>)}
                        <th className="px-4 py-3">Notes</th>
                        <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {filteredEmployees.length === 0 ? (
                        <tr><td colSpan={8 + customColumns.length} className="text-center py-8 text-slate-400">No records found.</td></tr>
                    ) : (
                        filteredEmployees.map((e, i) => (
                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3 font-mono text-xs text-slate-400">{i + 1}</td>
                                <td className="px-4 py-3 font-bold text-slate-700">{e.name}</td>
                                <td className="px-4 py-3">{e.fridays}</td>
                                <td className="px-4 py-3 font-bold text-blue-600">{e.overtime}</td>
                                <td className="px-4 py-3 text-red-500 text-xs font-bold">{e.absent}</td>
                                <td className="px-4 py-3 text-amber-600 text-xs font-bold">{e.sick}</td>
                                {customColumns.map(c => (
                                    <td key={c} className="px-4 py-3" contentEditable onBlur={(evt) => handleUpdateCustom(i, c, evt.currentTarget.textContent || '')}>
                                        {e[c]}
                                    </td>
                                ))}
                                <td className="px-4 py-3 text-xs text-slate-500 max-w-[150px] truncate">{e.notes}</td>
                                <td className="px-4 py-3 flex justify-center gap-2">
                                    <button onClick={() => handleEdit(i)} className="p-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"><i className="fas fa-pen text-xs"></i></button>
                                    <button onClick={() => handleDelete(i)} className="p-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100"><i className="fas fa-trash text-xs"></i></button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default LegacyOvertimeSystem;
