/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  ShieldAlert, 
  ShieldCheck, 
  Database, 
  AlertTriangle, 
  LineChart, 
  Plus, 
  Trash2, 
  ChevronRight,
  Shield,
  FileText,
  Terminal,
  HelpCircle,
  Search,
  Download,
  Printer,
  LogOut,
  Sun,
  Moon,
  LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// --- Firebase ---
import { auth, db, loginWithGoogle, testFirestoreConnection, User } from './lib/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';

// --- Types ---
type AssetType = 'Hardware' | 'Software' | 'Data' | 'Process' | 'Service';
type Criticality = 1 | 2 | 3 | 4 | 5;

interface Asset {
  id: string;
  name: string;
  type: AssetType;
  owner: string;
  criticality: Criticality;
  userId: string;
}

interface Threat {
  id: string;
  name: string;
  category: string;
  defaultLikelihood: number;
}

interface Risk {
  id: string;
  assetId: string;
  threatId: string;
  likelihood: number;
  impact: number;
  score: number; // Likelihood * Impact
  mitigation?: string;
  nistControl?: string;
  userId: string;
  createdAt?: any;
}

// --- Mock Libraries ---
const THREAT_LIBRARY: Threat[] = [
  { id: 't1', name: 'Phishing Attack', category: 'External', defaultLikelihood: 4 },
  { id: 't2', name: 'SQL Injection', category: 'External', defaultLikelihood: 3 },
  { id: 't3', name: 'Insider Data Theft', category: 'Internal', defaultLikelihood: 2 },
  { id: 't4', name: 'Ransomware', category: 'External', defaultLikelihood: 3 },
  { id: 't5', name: 'Unpatched Software Vulnerability', category: 'Technical', defaultLikelihood: 4 },
];

const VULNERABILITY_LIBRARY = [
  { id: 'v1', name: 'Weak Password Policy', description: 'Users are not required to use complex passwords or MFA.' },
  { id: 'v2', name: 'Legacy Software', description: 'System is running on an outdated OS with known exploits.' },
  { id: 'v3', name: 'Lacked Encryption', description: 'Sensitive data is stored in plaintext on the server.' },
  { id: 'v4', name: 'Poor Network Segmentation', description: 'High-value assets are reachable from guest networks.' },
];

const CONTROL_MAPPING: Record<string, { nist: string, iso: string, desc: string }> = {
  't1': { nist: 'AT-2, IA-2', iso: 'A.7.2.2', desc: 'Security Awareness training & Multi-factor Authentication.' },
  't2': { nist: 'SI-10', iso: 'A.14.2.5', desc: 'Information Input Validation & Parameterized Queries.' },
  't3': { nist: 'AC-2, AU-2', iso: 'A.9.2.1', desc: 'Account Management & Event Logging.' },
  't4': { nist: 'CP-9', iso: 'A.17.1.1', desc: 'System Information Backup & Storage.' },
  't5': { nist: 'SI-2', iso: 'A.12.6.1', desc: 'Flaw Remediation & Patch Management.' },
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'assets' | 'risks' | 'reports' | 'cli' | 'guide'>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const reportRef = useRef<HTMLDivElement>(null);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // --- Calculations ---
  const getRiskLevel = (score: number) => {
    if (score >= 16) return { label: 'Critical', color: 'bg-risk-critical', text: 'text-risk-critical', bgClass: 'bg-risk-critical text-white' };
    if (score >= 11) return { label: 'High', color: 'bg-risk-high', text: 'text-risk-high', bgClass: 'bg-risk-high text-white' };
    if (score >= 6) return { label: 'Medium', color: 'bg-risk-medium', text: 'text-risk-medium', bgClass: 'bg-risk-medium text-editorial-dark' };
    return { label: 'Low', color: 'bg-risk-low', text: 'text-risk-low', bgClass: 'bg-risk-low text-white' };
  };

  // --- Auth & Data Sync ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsLoading(false);
      if (u) testFirestoreConnection();
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setAssets([]);
      setRisks([]);
      return;
    }

    const qAssets = query(collection(db, 'assets'), where('userId', '==', user.uid));
    const unsubAssets = onSnapshot(qAssets, (snapshot) => {
      setAssets(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Asset)));
    });

    const qRisks = query(collection(db, 'risks'), where('userId', '==', user.uid));
    const unsubRisks = onSnapshot(qRisks, (snapshot) => {
      setRisks(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Risk)));
    });

    return () => {
      unsubAssets();
      unsubRisks();
    };
  }, [user]);

  const exportPDF = async () => {
    console.log('Exporting PDF...', reportRef.current);
    if (!reportRef.current) {
      console.error('Report reference is null');
      return;
    }
    
    try {
      // html2canvas fails on modern CSS like oklch/oklab. 
      // We can try to suppress errors or handle them.
      const canvas = await html2canvas(reportRef.current, { 
        scale: 2,
        useCORS: true,
        logging: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          // html2canvas fails on oklch/oklab. We force standard colors on the clone.
          const style = clonedDoc.createElement('style');
          style.innerHTML = `
            * { 
              color-scheme: light !important; 
            }
            /* Fallback for potential oklch/oklab usage in Tailwind 4 */
            :root {
              --color-editorial-bg: #FAF9F6 !important;
              --color-editorial-dark: #1A1A1A !important;
              --color-editorial-muted: #8C8984 !important;
              --color-editorial-secondary: #F0EEEA !important;
            }
          `;
          clonedDoc.head.appendChild(style);
        }
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`GuardianRisk_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      console.log('PDF exported successfully');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Failed to export PDF. Check console for details.');
    }
  };

  const addAsset = async () => {
    if (!user) return;
    try {
      const newAssetData = {
        name: 'New Asset',
        type: 'Hardware',
        owner: 'TBD',
        criticality: 3,
        userId: user.uid
      };
      const docRef = await addDoc(collection(db, 'assets'), newAssetData);
      // Local state is updated via onSnapshot
    } catch (error) {
      console.error("Error adding asset:", error);
    }
  };

  const deleteAsset = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'assets', id));
      // Risks sharing this asset will be removed via onSnapshot or extra logic
      const relatedRisks = risks.filter(r => r.assetId === id);
      for (const r of relatedRisks) {
        await deleteDoc(doc(db, 'risks', r.id));
      }
    } catch (error) {
      console.error("Error deleting asset:", error);
    }
  };

  const updateAssetField = async (id: string, field: string, value: any) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'assets', id), { [field]: value });
    } catch (error) {
      console.error("Error updating asset:", error);
    }
  };

  const addRisk = async (assetId: string, threatId: string, vulnId: string) => {
    if (!user) return;
    const asset = assets.find(a => a.id === assetId);
    const threat = THREAT_LIBRARY.find(t => t.id === threatId);
    if (!asset || !threat) return;

    try {
      const newRiskData = {
        assetId,
        threatId,
        likelihood: threat.defaultLikelihood,
        impact: asset.criticality,
        score: threat.defaultLikelihood * asset.criticality,
        nistControl: CONTROL_MAPPING[threatId]?.nist || 'TBD',
        userId: user.uid,
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, 'risks'), newRiskData);
    } catch (error) {
      console.error("Error adding risk:", error);
    }
  };

  const updateRiskField = async (id: string, field: string, value: any) => {
    if (!user) return;
    try {
      const updates: any = { [field]: value };
      if (['likelihood', 'impact'].includes(field)) {
        const risk = risks.find(r => r.id === id);
        if (risk) {
          const l = field === 'likelihood' ? value : risk.likelihood;
          const i = field === 'impact' ? value : risk.impact;
          updates.score = l * i;
        }
      }
      await updateDoc(doc(db, 'risks', id), updates);
    } catch (error) {
      console.error("Error updating risk:", error);
    }
  };

  const deleteRisk = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'risks', id));
    } catch (error) {
      console.error("Error deleting risk:", error);
    }
  };

  return (
    <div className={`min-h-screen font-sans transition-colors duration-500 ${isDarkMode ? 'bg-[#0f1115] text-white' : 'bg-editorial-bg text-editorial-dark'}`}>
      {!user && !isLoading ? (
        <div className="fixed inset-0 z-[100] bg-editorial-dark flex items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white text-editorial-dark p-12 max-w-md w-full shadow-2xl border-t-8 border-editorial-dark"
          >
            <div className="mb-12 text-center">
              <Shield className="w-12 h-12 mx-auto mb-4" />
              <h1 className="text-4xl font-serif italic mb-2">GuardianRisk</h1>
              <p className="text-[10px] uppercase tracking-widest font-black opacity-50">Enterprise GRC Terminal Node</p>
            </div>
            <div className="space-y-6">
              <div className="text-center space-y-4">
                <p className="text-xs font-serif italic mb-6">Connect your security identity to access the Risk Engine and persistent GRC records.</p>
                <button 
                  onClick={loginWithGoogle}
                  className="w-full bg-editorial-dark text-white py-5 font-black text-xs uppercase tracking-[0.4em] hover:bg-black transition-all shadow-xl flex items-center justify-center gap-4"
                >
                  <LogIn size={18} /> Authenticate Session
                </button>
              </div>
            </div>
            <p className="mt-8 text-[8px] text-center opacity-30 font-mono tracking-widest">NIST SP 800-30 COMPLIANT ARCHITECTURE // PERSISTENT_DATA_NODE</p>
          </motion.div>
        </div>
      ) : null}

      {isLoading && (
        <div className="fixed inset-0 z-[110] bg-editorial-bg flex items-center justify-center">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[1em] font-black animate-pulse">Initializing Security Node...</p>
          </div>
        </div>
      )}

      {/* Editorial Header */}
      <header className={`px-12 py-10 border-b border-editorial-dark/10 flex justify-between items-end ${isDarkMode ? 'bg-[#15181e]' : 'bg-white'}`}>
        <div className="space-y-1">
          <p className={`text-[10px] uppercase tracking-[0.3em] font-black ${isDarkMode ? 'text-white/40' : 'text-editorial-muted'}`}>Security Standards (NIST)</p>
          <h1 className="text-6xl font-serif italic font-light tracking-tighter">
            Security Check <span className="not-italic font-sans font-black text-[10px] bg-editorial-dark text-white px-3 py-1.5 ml-4 align-middle uppercase tracking-widest">v1.0.4</span>
          </h1>
        </div>
        <div className="flex items-center gap-10">
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`w-10 h-10 rounded-full border border-editorial-dark/10 flex items-center justify-center hover:bg-editorial-secondary transition-all ${isDarkMode ? 'text-white' : 'text-editorial-dark'}`}
          >
            {isDarkMode ? '☼' : '☾'}
          </button>
          <div className="text-right font-sans flex items-center gap-6">
            <div className="text-right">
              <p className={`text-[10px] font-mono font-bold uppercase tracking-widest ${isDarkMode ? 'text-white/40' : 'text-editorial-muted'} mb-1`}>Identity: {user?.email?.split('@')[0] || 'GUEST'}</p>
              <p className="text-xs font-bold">Node: {user?.uid.slice(0, 8) || 'NULL'}</p>
            </div>
            <button 
              onClick={() => signOut(auth)}
              className={`w-10 h-10 rounded-full border border-editorial-dark/10 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all`}
              title="Sign Out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 relative overflow-hidden">
        {/* Navigation Rail */}
        <nav className={`w-20 border-r border-editorial-dark/10 flex flex-col pt-10 gap-10 items-center z-20 ${isDarkMode ? 'bg-[#15181e]' : 'bg-white'}`}>
          <NavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LineChart size={22} />} label="Overview" />
          <NavItem active={activeTab === 'assets'} onClick={() => setActiveTab('assets')} icon={<Database size={22} />} label="Items" />
          <NavItem active={activeTab === 'risks'} onClick={() => setActiveTab('risks')} icon={<ShieldAlert size={22} />} label="Calculator" />
          <NavItem active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} icon={<FileText size={22} />} label="Summary" />
          <NavItem active={activeTab === 'cli'} onClick={() => setActiveTab('cli')} icon={<Terminal size={22} />} label="CLI" />
          <NavItem active={activeTab === 'guide'} onClick={() => setActiveTab('guide')} icon={<HelpCircle size={22} />} label="Help" />
        </nav>

        {/* Main Workspace */}
        <main className="flex-1 overflow-y-auto p-16 max-w-7xl">
          <div className="mb-16">
            <h2 className="text-3xl font-serif italic font-medium leading-none mb-3">
              {activeTab === 'dashboard' && 'Security Status Overview'}
              {activeTab === 'assets' && 'List of Items'}
              {activeTab === 'risks' && 'Risk Prediction Table'}
              {activeTab === 'reports' && 'Final Results Analysis'}
              {activeTab === 'cli' && 'Simple Terminal Tool'}
              {activeTab === 'guide' && 'How to Use & Documentation'}
            </h2>
            <div className="h-0.5 w-12 bg-editorial-dark mb-4"></div>
            <p className="text-editorial-muted text-sm tracking-wide lowercase italic font-medium">
              {activeTab === 'dashboard' && 'overall view of your security level.'}
              {activeTab === 'assets' && 'listing all your tools, websites, and data.'}
              {activeTab === 'risks' && 'predicting how bad a problem could be.'}
              {activeTab === 'reports' && 'final summary with advice on how to improve.'}
              {activeTab === 'cli' && 'a simple way to type in security checks.'}
              {activeTab === 'guide' && 'easy instructions on how to use this tool.'}
            </p>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeTab === 'dashboard' && <DashboardView assets={assets} risks={risks} getRiskLevel={getRiskLevel} />}
              {activeTab === 'assets' && (
                <div className="space-y-12">
                  <div className="flex justify-between items-center">
                    <div className="relative group min-w-[300px]">
                      <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-editorial-muted group-focus-within:text-editorial-dark transition-colors" />
                      <input 
                        type="text" 
                        placeholder="Filter inventory..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-white border border-editorial-dark/10 py-3 pl-12 pr-4 text-xs font-bold uppercase tracking-widest outline-none focus:border-editorial-dark transition-all"
                      />
                    </div>
                    <button 
                      onClick={addAsset}
                      className="px-8 py-3 bg-editorial-dark text-white text-[10px] font-black uppercase tracking-[0.3em] hover:bg-black transition-all shadow-xl shadow-editorial-dark/10"
                    >
                      Add New Item
                    </button>
                  </div>
                  <AssetList 
                    assets={assets.filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase()) || a.type.toLowerCase().includes(searchTerm.toLowerCase()))} 
                    onUpdate={updateAssetField}
                    onDelete={deleteAsset} 
                  />
                </div>
              )}
              {activeTab === 'risks' && (
                <RiskEngine 
                  assets={assets} 
                  risks={risks} 
                  threats={THREAT_LIBRARY} 
                  vulns={VULNERABILITY_LIBRARY}
                  onAddRisk={addRisk}
                  onUpdateRisk={updateRiskField}
                  onDeleteRisk={deleteRisk}
                  getRiskLevel={getRiskLevel}
                />
              )}
              {activeTab === 'reports' && (
                <ReportsView 
                  risks={risks} 
                  assets={assets} 
                  threats={THREAT_LIBRARY} 
                  getRiskLevel={getRiskLevel} 
                  exportPDF={exportPDF}
                  reportRef={reportRef}
                />
              )}
              {activeTab === 'cli' && (
                <TerminalView 
                  assets={assets} 
                  risks={risks} 
                  threats={THREAT_LIBRARY}
                  onAddAsset={async (name: string, type: AssetType, crit: Criticality) => {
                    if (!user) return 'ERR_NO_AUTH';
                    try {
                      const newAssetData = {
                        name,
                        type,
                        owner: 'CLI_USER',
                        criticality: crit,
                        userId: user.uid
                      };
                      const docRef = await addDoc(collection(db, 'assets'), newAssetData);
                      return docRef.id;
                    } catch (error) {
                      console.error("CLI Asset Add Error:", error);
                      return 'ERR_DB';
                    }
                  }}
                  onAddRisk={addRisk}
                />
              )}
              {activeTab === 'guide' && <GuideView />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Global Status Bar */}
      <footer className="h-12 bg-editorial-dark text-white flex justify-between items-center px-12 text-[10px] uppercase tracking-[0.2em] font-mono z-30">
        <div className="flex gap-10">
          <span className="flex items-center gap-2">System Status: <span className="text-risk-medium">OK</span></span>
          <span className="flex items-center gap-2">Rule Check: <span className="text-risk-medium">SYNCED</span></span>
        </div>
        <div className="opacity-50 tracking-widest">SYSTEM_ONLINE // ALL_GOOD</div>
      </footer>
    </div>
  );
}


// --- View Components ---

function ReportsView({ risks, assets, threats, getRiskLevel, exportPDF, reportRef }: any) {
  return (
    <div className="space-y-12 pb-20">
      <div ref={reportRef} className="bg-white p-16 border border-editorial-dark/10 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 text-right opacity-10 pointer-events-none">
          <div className="text-[160px] font-serif leading-none italic select-none">NIST</div>
        </div>
        
        <div className="flex justify-between items-start mb-24 border-b-2 border-editorial-dark pb-10">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.5em] text-editorial-muted mb-5">Security Status Report // OFFICIAL</p>
            <h3 className="text-5xl font-serif italic text-editorial-dark font-light">Summary of Problems</h3>
          </div>
          <div className="text-right font-sans">
            <p className="text-sm font-mono font-bold uppercase mb-1">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            <p className="text-[10px] text-editorial-muted font-black tracking-widest">CLASSIFICATION: FOR_TEAM_ONLY</p>
          </div>
        </div>

        <div className="space-y-16">
          {risks.length === 0 ? (
            <div className="text-center py-32 text-editorial-muted italic font-serif text-2xl border border-dashed border-editorial-dark/10">No identified risks currently indexed in the register.</div>
          ) : (
            risks.sort((a: any, b: any) => b.score - a.score).map((risk: Risk) => {
              const asset = assets.find((a: any) => a.id === risk.assetId);
              const threat = threats.find((t: any) => t.id === risk.threatId);
              const level = getRiskLevel(risk.score);
              const mapping = CONTROL_MAPPING[risk.threatId];

              return (
                <div key={risk.id} className="relative group border-b border-editorial-dark/5 pb-16 last:border-0 last:pb-0">
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <div className="flex items-center gap-6 mb-4">
                         <span className={`px-4 py-1 text-[9px] font-black uppercase tracking-[0.2em] ${level.bgClass}`}>
                          {level.label} Danger Level
                        </span>
                        <div className="flex items-center gap-2">
                           <span className="text-[10px] font-black text-editorial-muted uppercase tracking-widest">RULE REF:</span>
                           <span className="text-[10px] font-mono font-bold bg-editorial-secondary px-2 py-0.5">{risk.nistControl}</span>
                        </div>
                      </div>
                      <h4 className="font-serif italic text-3xl leading-snug max-w-3xl">
                        Potential <span className="underline decoration-editorial-dark/10 underline-offset-8">{threat?.name}</span> attack on <span className="font-bold not-italic">{asset?.name}</span>.
                      </h4>
                    </div>
                    <div className="text-right">
                       <p className="text-[9px] font-black text-editorial-muted uppercase tracking-widest mb-1">Calculated Level</p>
                       <p className="text-4xl font-mono font-bold">{risk.score}/25</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
                    <div className="md:col-span-2">
                      <p className="text-[10px] font-black text-editorial-muted mb-4 uppercase tracking-[0.3em]">Advice on how to fix this</p>
                      <p className="text-editorial-dark leading-relaxed font-serif italic text-lg border-l-4 border-editorial-dark/10 pl-8 py-2">
                        {mapping?.desc || 'Standard safety rules should be followed. Start by making the item harder to reach and adding extra login steps.'}
                      </p>
                    </div>
                    <div className="space-y-6">
                      <div className="bg-editorial-secondary p-6 border-l-2 border-editorial-dark/20">
                        <p className="text-[9px] font-black text-editorial-muted mb-3 uppercase tracking-widest">Security Rule Set</p>
                        <p className="text-xl font-serif italic text-editorial-dark">{mapping?.nist || 'Basic Rules'}</p>
                      </div>
                      <div className="bg-editorial-dark text-white p-6 border-l-2 border-risk-medium/50">
                        <p className="text-[9px] font-black text-white/50 mb-3 uppercase tracking-widest">International Label</p>
                        <p className="text-xl font-serif italic">{mapping?.iso || 'Standard Code'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-32 pt-12 border-t-2 border-editorial-dark flex justify-between items-center bg-editorial-secondary p-12">
           <div className="max-w-md">
             <h5 className="text-[11px] font-black uppercase tracking-[0.4em] mb-3">Report Certification</h5>
             <p className="text-xs text-editorial-muted font-medium italic leading-relaxed">
               This memorandum serves as a formal communication of residual risk post-assessment. 
               All findings are indexed to internal controls and international standards.
             </p>
           </div>
           <div className="flex gap-4">
             <button 
              onClick={() => {
                const data = JSON.stringify({ risks, assets }, null, 2);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `risk-inventory-${new Date().toISOString().split('T')[0]}.json`;
                a.click();
              }}
              className="flex items-center gap-4 px-8 py-5 border border-editorial-dark text-[11px] font-black uppercase tracking-[0.4em] hover:bg-white transition-all"
             >
               <Download size={14} /> Export Dataset
             </button>
             <button 
              onClick={exportPDF}
              className="px-12 py-5 bg-editorial-dark text-white text-[11px] font-black uppercase tracking-[0.4em] hover:bg-black transition-all shadow-2xl shadow-editorial-dark/20 text-center flex-1 flex items-center justify-center gap-3"
             >
               <Printer size={14} /> Authorize Report (PDF)
             </button>
           </div>
        </div>
      </div>
    </div>
  );
}

function GuideView() {
  return (
    <div className="bg-white border border-editorial-dark/10 shadow-sm font-sans">
      <div className="p-16 max-w-4xl mx-auto space-y-24">
        {/* Cover Section */}
        <section className="text-center border-b border-editorial-dark/10 pb-20">
          <p className="text-[10px] font-black uppercase tracking-[0.6em] text-editorial-muted mb-8">Official Guide // Internal Version 1.0b</p>
          <h2 className="text-7xl font-serif italic mb-8 font-light">The Safety Handbook</h2>
          <div className="h-1 w-24 bg-editorial-dark mx-auto mb-8"></div>
          <p className="text-lg text-editorial-muted max-w-xl mx-auto font-serif italic leading-relaxed">
            A simple guide on how to use the GuardianRisk tool to keep your company safe.
          </p>
        </section>

        {/* Section 1: Overview */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-16 items-start">
          <div className="md:sticky md:top-10">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] mb-4 text-editorial-dark/30">01 // THE IDEA</h3>
            <p className="text-2xl font-serif italic leading-tight">What is this System?</p>
          </div>
          <div className="md:col-span-2 space-y-6 text-sm text-editorial-dark/80 leading-relaxed">
            <p>
              GuardianRisk is a <span className="font-bold">Security Tool</span> made to help you find and fix problems in your computer systems.
            </p>
            <p>
              Instead of using messy spreadsheets, this tool lists all your items (like websites or databases) and checks what dangers might affect them. It helps you see how bad a problem is and how to fix it.
            </p>
          </div>
        </section>

        {/* Section 2: Icons & Navigation */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-16 items-start border-t border-editorial-dark/5 pt-16">
          <div className="md:sticky md:top-10">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] mb-4 text-editorial-dark/30">02 // EASY KEY</h3>
            <p className="text-2xl font-serif italic leading-tight">Finding Your Way</p>
          </div>
          <div className="md:col-span-2 space-y-8">
            {[
              { icon: <LineChart size={20} />, label: "Overview", desc: "A quick look at your current safety level and where the problems are." },
              { icon: <Database size={20} />, label: "Items", desc: "A list of everything you want to protect. Start by adding your tools here." },
              { icon: <ShieldAlert size={20} />, label: "Calculator", desc: "The place where you match items with dangers to see how much damage they could do." },
              { icon: <FileText size={20} />, label: "Summary", desc: "A final page you can print or share that shows all the problems found." },
              { icon: <Terminal size={20} />, label: "Typing Tool", desc: "A fast way for experts to type in data quickly without using the mouse." },
            ].map((item, i) => (
              <div key={i} className="flex gap-8 group">
                <div className="w-12 h-12 bg-editorial-secondary flex items-center justify-center shrink-0 border border-editorial-dark/5 group-hover:bg-editorial-dark group-hover:text-white transition-all">
                  {item.icon}
                </div>
                <div>
                  <h4 className="font-bold text-xs uppercase tracking-widest mb-1">{item.label}</h4>
                  <p className="text-xs text-editorial-muted leading-relaxed italic">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Risk Scoring */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-16 items-start border-t border-editorial-dark/5 pt-16">
          <div className="md:sticky md:top-10">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] mb-4 text-editorial-dark/30">03 // HOW WE SCORE</h3>
            <p className="text-2xl font-serif italic leading-tight">Scoring Math</p>
          </div>
          <div className="md:col-span-2 space-y-10">
            <div className="p-8 bg-editorial-secondary border border-editorial-dark/10">
              <p className="font-mono text-[9px] mb-4 opacity-50 uppercase">The Simple Math</p>
              <p className="text-4xl font-serif italic mb-2">Chance (1-5) × Damage (1-5) = Risk Score (1-25)</p>
              <p className="text-xs text-editorial-muted">Our tool calculates how dangerous a situation is by multiplying how likely it is to happen by how much damage it would cause.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              {[
                { range: "16-25", label: "VERY HIGH", desc: "Extreme danger. Stop everything and fix this immediately." },
                { range: "11-15", label: "HIGH", desc: "Needs an urgent fix. Put this at the top of your list." },
                { range: "6-10", label: "MEDIUM", desc: "Needs to be fixed soon, but you can keep working for now." },
                { range: "1-5", label: "LOW", desc: "Small problem. Fix it when you have spare time." },
              ].map((bucket, i) => (
                <div key={i} className="border-b border-editorial-dark/10 pb-4">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-xs font-black tracking-tighter">{bucket.label}</span>
                    <span className="font-mono text-[9px] opacity-50">{bucket.range}</span>
                  </div>
                  <p className="text-[10px] italic leading-tight text-editorial-muted">{bucket.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="pt-20 border-t border-editorial-dark/5 flex justify-between items-center">
          <div className="opacity-20 flex gap-4 grayscale">
            <img src="https://upload.wikimedia.org/wikipedia/commons/b/bc/NIST_logo.svg" alt="NIST" className="h-6" referrerPolicy="no-referrer" />
          </div>
          <p className="text-[8px] font-mono opacity-30 uppercase tracking-[0.4em]">GuardianRisk End-of-Manual // REF_GRC_2024</p>
        </footer>
      </div>
    </div>
  );
}

function RiskEngine({ assets, risks, threats, vulns, onAddRisk, onUpdateRisk, onDeleteRisk, getRiskLevel }: any) {
  const [selectedAsset, setSelectedAsset] = useState(assets[0]?.id || '');
  const [selectedThreat, setSelectedThreat] = useState(threats[0]?.id || '');
  const [selectedVuln, setSelectedVuln] = useState(vulns[0]?.id || '');

  return (
    <div className="space-y-12 font-sans">
      <div className="bg-editorial-secondary p-12 border border-editorial-dark/10 grid grid-cols-1 md:grid-cols-3 gap-10">
        <div className="col-span-full border-b border-editorial-dark/10 pb-4 mb-2">
          <h3 className="font-serif italic text-2xl">Fix & Problem Calculator</h3>
          <p className="text-xs text-editorial-muted font-medium mt-1">Found Danger & Weak Spot Check</p>
        </div>
        
        <div>
          <label className="block text-[10px] font-black text-editorial-muted mb-3 uppercase tracking-[0.2em]">01 Select Item</label>
          <select 
            value={selectedAsset} 
            onChange={(e) => setSelectedAsset(e.target.value)}
            className="w-full bg-white border border-editorial-dark/10 p-4 outline-none text-xs font-bold uppercase tracking-widest focus:border-editorial-dark transition-all rounded-none"
          >
            {assets.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        
        <div>
          <label className="block text-[10px] font-black text-editorial-muted mb-3 uppercase tracking-[0.2em]">02 Potential Danger</label>
          <select 
            value={selectedThreat} 
            onChange={(e) => setSelectedThreat(e.target.value)}
            className="w-full bg-white border border-editorial-dark/10 p-4 outline-none text-xs font-bold uppercase tracking-widest focus:border-editorial-dark transition-all rounded-none"
          >
            {threats.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-black text-editorial-muted mb-3 uppercase tracking-[0.2em]">03 System Weakness</label>
          <select 
            value={selectedVuln} 
            onChange={(e) => setSelectedVuln(e.target.value)}
            className="w-full bg-white border border-editorial-dark/10 p-4 outline-none text-xs font-bold uppercase tracking-widest focus:border-editorial-dark transition-all rounded-none"
          >
            {vulns.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>

        <div className="col-span-full pt-8 flex items-center justify-between border-t border-editorial-dark/5">
           <div className="max-w-md">
             <p className="text-[11px] font-serif italic text-editorial-dark/60 leading-relaxed underline underline-offset-4 decoration-editorial-dark/10">
              "Risk is the danger to your mission when a weak spot is misused by an attacker."
             </p>
           </div>
           <button 
            onClick={() => onAddRisk(selectedAsset, selectedThreat, selectedVuln)}
            className="bg-editorial-dark text-white px-10 py-4 font-bold text-xs uppercase tracking-[0.3em] hover:bg-black transition-all shadow-xl shadow-editorial-dark/10"
          >
            Add to List
          </button>
        </div>
      </div>

      <div className="bg-white border border-editorial-dark/10 overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-editorial-secondary border-b border-editorial-dark/20 text-[10px] uppercase tracking-[0.2em] font-black text-editorial-muted font-sans">
            <tr>
              <th className="px-8 py-5">Security Dangers</th>
              <th className="px-8 py-5 text-center">Chance × Damage</th>
              <th className="px-8 py-5 text-center">Total Score</th>
              <th className="px-8 py-5 text-right">Danger Level</th>
              <th className="px-8 py-5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-editorial-dark/5">
            {risks.map((risk: Risk) => {
              const asset = assets.find((a: any) => a.id === risk.assetId);
              const threat = threats.find((t: any) => t.id === risk.threatId);
              const level = getRiskLevel(risk.score);
              
              return (
                <tr key={risk.id} className="hover:bg-editorial-secondary/50 transition-colors group">
                  <td className="px-8 py-8">
                    <div className="font-serif italic text-xl text-editorial-dark">{asset?.name}</div>
                    <p className="text-[10px] text-editorial-muted font-bold uppercase tracking-widest mt-1">Could be attacked by {threat?.name}</p>
                  </td>
                  <td className="px-8 py-8">
                    <div className="flex items-center justify-center gap-6">
                      <div className="flex flex-col items-center gap-2">
                        <input 
                          type="range" min="1" max="5" 
                          value={risk.likelihood} 
                          onChange={(e) => onUpdateRisk(risk.id, 'likelihood', parseInt(e.target.value))}
                          className="w-16 h-1 bg-editorial-dark/10 rounded-none appearance-none cursor-pointer accent-editorial-dark font-sans"
                        />
                        <span className="text-[9px] font-black tracking-tighter text-editorial-muted uppercase font-sans">Chance: {risk.likelihood}</span>
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <input 
                          type="range" min="1" max="5" 
                          value={risk.impact} 
                          onChange={(e) => onUpdateRisk(risk.id, 'impact', parseInt(e.target.value))}
                          className="w-16 h-1 bg-editorial-dark/10 rounded-none appearance-none cursor-pointer accent-editorial-dark font-sans"
                        />
                        <span className="text-[9px] font-black tracking-tighter text-editorial-muted uppercase font-sans">Damage: {risk.impact}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-8 text-center font-mono font-bold text-3xl text-editorial-dark">{risk.score}</td>
                  <td className="px-8 py-8 text-right">
                    <span className={`inline-block px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-white ${level.bgClass}`}>
                      {level.label}
                    </span>
                  </td>
                  <td className="px-8 py-8 text-right">
                    <button 
                      onClick={() => onDeleteRisk(risk.id)}
                      className="text-editorial-muted hover:text-risk-critical opacity-0 group-hover:opacity-100 transition-all font-sans"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {risks.length === 0 && (
              <tr>
                <td colSpan={5} className="px-8 py-32 text-center">
                  <p className="font-serif italic text-2xl text-editorial-dark/20 uppercase tracking-tighter">Zero Assessments Commited</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RiskEngineWrapper(props: any) {
  return <RiskEngine {...props} />;
}


// --- Components ---

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-12 h-12 flex items-center justify-center transition-all relative group ${
        active ? 'text-editorial-dark' : 'text-editorial-muted hover:text-editorial-dark'
      }`}
    >
      {active && (
        <motion.div 
          layoutId="nav-indicator" 
          className="absolute -left-10 w-2 h-8 bg-editorial-dark" 
        />
      )}
      <span className={`relative z-10 transition-transform ${active ? 'scale-125' : 'group-hover:scale-110'}`}>{icon}</span>
    </button>
  );
}

function DashboardView({ assets, risks, getRiskLevel }: any) {
  const stats = useMemo(() => {
    const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    risks.forEach((r: any) => {
      counts[getRiskLevel(r.score).label as keyof typeof counts]++;
    });
    return counts;
  }, [risks, getRiskLevel]);

  // Heatmap Grid Data (5x5)
  const heatmapData = useMemo(() => {
    const grid = Array(5).fill(0).map(() => Array(5).fill(0));
    risks.forEach((r: any) => {
      const l = Math.min(Math.max(r.likelihood - 1, 0), 4);
      const i = Math.min(Math.max(r.impact - 1, 0), 4);
      grid[4-l][i]++; // Invert likelihood for visual (5 at top)
    });
    return grid;
  }, [risks]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-10 font-sans">
      <StatCard label="Total Items Listed" value={assets.length} borderColor="border-editorial-dark" />
      <StatCard label="Found Security Dangers" value={risks.length} borderColor="border-editorial-muted" />
      <StatCard label="Very High Risks" value={stats.Critical} borderColor="border-risk-critical" color="text-risk-critical" />
      <StatCard label="Safety Readiness" value="65%" color="text-emerald-600" borderColor="border-emerald-600" />

      <div className="col-span-full md:col-span-3 bg-white dark:bg-white/5 p-12 border border-editorial-dark/10 shadow-sm transition-colors">
        <h3 className="text-2xl font-serif italic mb-12 border-b border-editorial-dark/5 pb-4">
          Risk Heatmap (5x5 Matrix)
        </h3>
        
        <div className="flex flex-col md:flex-row gap-12">
          {/* Heatmap Grid */}
          <div className="relative group p-4 border border-editorial-dark/5 bg-gray-50 dark:bg-black/20 flex-grow">
            <div className="absolute -left-20 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] font-black uppercase tracking-widest opacity-30">Likelihood (1-5)</div>
            <div className="absolute left-1/2 -bottom-10 -translate-x-1/2 text-[10px] font-black uppercase tracking-widest opacity-30">Impact (1-5)</div>
            
            <div className="grid grid-cols-5 grid-rows-5 gap-1.5 h-[350px]">
              {heatmapData.map((row, rIdx) => (
                row.map((count, cIdx) => {
                  const score = (5 - rIdx) * (cIdx + 1);
                  const config = getRiskLevel(score);
                  return (
                    <div 
                      key={`${rIdx}-${cIdx}`}
                      className={`relative flex items-center justify-center border border-black/5 transition-all ${config.bgClass} ${count > 0 ? 'scale-100 shadow-md ring-1 ring-black/10' : 'opacity-10 scale-95'}`}
                    >
                      {count > 0 && <span className="font-mono font-bold text-sm drop-shadow-sm">{count}</span>}
                      <div className="absolute inset-0 opacity-0 hover:opacity-100 bg-black/10 flex items-center justify-center transition-opacity cursor-help overflow-hidden">
                        <span className="text-[7px] font-black bg-white text-editorial-dark px-1 py-0.5 rounded shadow">LVL {score}</span>
                      </div>
                    </div>
                  );
                })
              ))}
            </div>
          </div>

          {/* Scale Legend */}
          <div className="w-full md:w-32 border-l border-editorial-dark/5 pl-8 py-4 space-y-6">
             {['Critical', 'High', 'Medium', 'Low'].map((l) => (
               <div key={l} className="flex flex-col gap-1">
                 <div className={`w-full h-1.5 ${getRiskLevel(l === 'Critical' ? 20 : l === 'High' ? 12 : l === 'Medium' ? 8 : 4).color}`}></div>
                 <span className="text-[9px] font-black uppercase opacity-50">{l}</span>
                 <span className="text-lg font-serif italic leading-none">{stats[l as keyof typeof stats]} Cases</span>
               </div>
             ))}
          </div>
        </div>
      </div>

      <div className="md:col-span-1 bg-editorial-dark text-white p-8 border border-editorial-dark/10 flex flex-col justify-between">
        <div>
          <p className="text-[9px] uppercase tracking-[0.4em] font-black mb-6 opacity-50">Risk Limit</p>
          <p className="text-3xl font-serif italic mb-4">Allowed Danger Level: 10</p>
          <p className="text-xs text-white/60 leading-relaxed font-light">Anything over 10 needs to be fixed immediately as per company rules.</p>
        </div>
        <div className="pt-8 border-t border-white/10 italic text-[10px] text-white/40">
          Last check: just now
        </div>
      </div>
    </div>
  );
}

function TerminalView({ assets, risks, threats, onAddAsset, onAddRisk }: any) {
  const [history, setHistory] = useState<string[]>(['GUARDIAN RISK CLI [Version 1.0.4]', '(c) Guardian Systems. NIST SP 800-30 Compliant.', 'Type "help" to list instructions.', '']);
  const [input, setInput] = useState('');
  const terminalRef = React.useRef<HTMLDivElement>(null);

  const handleCommand = async (cmd: string) => {
    const parts = cmd.toLowerCase().trim().split(' ');
    const command = parts[0];
    const args = parts.slice(1);
    
    let output = [`> ${cmd}`];

    switch (command) {
      case 'help':
        output.push('Available commands:', 
          '  items                - List all managed items',
          '  add-item [n] [t] [i] - Add item (name type[H/S/D/P/S] importance[1-5])',
          '  dangers              - View current problem list',
          '  check [aid] [tid]    - Create new check (ItemID DangerID)',
          '  library              - List available danger library IDs',
          '  clear                - Flush terminal history'
        );
        break;
      case 'items':
        if (assets.length === 0) output.push('No items added.');
        else assets.forEach((a: any) => output.push(`[${a.id}] ${a.name} | ${a.type} | Importance: ${a.criticality}`));
        break;
      case 'dangers':
        if (risks.length === 0) output.push('Problem list is empty.');
        else risks.forEach((r: any) => output.push(`ID: ${r.id} | Item: ${r.assetId} | Score: ${r.score}`));
        break;
      case 'library':
        threats.forEach((t: any) => output.push(`[${t.id}] ${t.name}`));
        break;
      case 'add-item':
        if (args.length < 3) {
          output.push('Usage: add-item [name] [type] [1-5]');
        } else {
          const typeMap: any = { h: 'Hardware', s: 'Software', d: 'Data', p: 'Process', v: 'Service' };
          const type = typeMap[args[1]] || 'Hardware';
          const id = await onAddAsset(args[0], type, parseInt(args[2]) || 3);
          output.push(`SUCCESS: Item created with ID ${id}`);
        }
        break;
      case 'check':
        if (args.length < 2) {
          output.push('Usage: check [item_id] [danger_id]');
        } else {
          await onAddRisk(args[0], args[1], 'v1');
          output.push('SUCCESS: Security check added.');
        }
        break;
      case 'clear':
        setHistory([]);
        return;
      default:
        output.push(`Command not found: ${command}`);
    }

    setHistory(prev => [...prev, ...output, '']);
    setTimeout(() => {
      if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }, 10);
  };

  return (
    <div className="bg-editorial-dark text-emerald-400 p-10 font-mono text-sm border-editorial-dark border shadow-2xl relative min-h-[500px] flex flex-col">
      <div className="absolute top-4 right-6 opacity-20 text-[10px] uppercase tracking-widest text-white">TTY/S0 - 1107Z</div>
      <div 
        ref={terminalRef}
        className="flex-grow overflow-y-auto mb-6 space-y-1 scrollbar-hide"
      >
        {history.map((line, i) => (
          <div key={i} className={line.startsWith('>') ? 'text-white' : line.includes('SUCCESS') ? 'text-blue-400' : ''}>
            {line || <br />}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 border-t border-white/10 pt-6">
        <span className="text-white opacity-50">$</span>
        <input 
          autoFocus
          className="bg-transparent border-none outline-none flex-grow text-white"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleCommand(input);
              setInput('');
            }
          }}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, color = "text-editorial-dark", borderColor }: any) {
  return (
    <div className={`bg-white p-6 border-l-4 ${borderColor} border-y border-r border-editorial-dark/10`}>
      <p className="text-[9px] uppercase tracking-[0.2em] font-black text-editorial-muted mb-4">{label}</p>
      <div className={`text-4xl font-serif italic ${color}`}>{value}</div>
    </div>
  );
}

function AssetList({ assets, onUpdate, onDelete }: { assets: Asset[], onUpdate: (id: string, f: string, v: any) => void, onDelete: (id: string) => void }) {
  return (
    <div className="bg-white border border-editorial-dark/10 overflow-hidden font-sans">
      <table className="w-full text-left">
        <thead className="border-b border-editorial-dark/20 text-[11px] uppercase tracking-[0.2em] font-black text-editorial-muted">
          <tr>
            <th className="px-8 py-6">Item Name</th>
            <th className="px-8 py-6">Type</th>
            <th className="px-8 py-6">Owner</th>
            <th className="px-8 py-6 text-center">Importance</th>
            <th className="px-8 py-6"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-editorial-dark/5">
          {assets.map((asset: Asset) => (
            <tr key={asset.id} className="hover:bg-editorial-secondary transition-colors group">
              <td className="px-8 py-6">
                <input 
                  type="text" 
                  value={asset.name} 
                  onChange={(e) => onUpdate(asset.id, 'name', e.target.value)}
                  className="bg-transparent font-serif italic text-lg focus:outline-none border-b border-transparent focus:border-editorial-dark pb-1 w-full"
                />
              </td>
              <td className="px-8 py-6">
                <select 
                  value={asset.type}
                  onChange={(e) => onUpdate(asset.id, 'type', e.target.value)}
                  className="bg-transparent text-[10px] font-bold uppercase tracking-widest text-editorial-muted border border-editorial-dark/10 px-2 py-1 focus:outline-none rounded-none"
                >
                  <option>Hardware</option>
                  <option>Software</option>
                  <option>Data</option>
                  <option>Process</option>
                  <option>Service</option>
                </select>
              </td>
              <td className="px-8 py-6 font-mono text-xs uppercase text-editorial-muted">{asset.owner}</td>
              <td className="px-8 py-6">
                <div className="flex justify-center gap-1 font-sans">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => onUpdate(asset.id, 'criticality', n)}
                      className={`w-6 h-6 text-[10px] font-bold transition-all border ${
                        asset.criticality >= n ? 'bg-editorial-dark text-white border-editorial-dark' : 'bg-transparent text-editorial-muted border-editorial-dark/10'
                      }`}
                    >
                      {n === 1 ? 'L' : n === 5 ? 'H' : n}
                    </button>
                  ))}
                </div>
              </td>
              <td className="px-8 py-6 text-right">
                <button onClick={() => onDelete(asset.id)} className="text-editorial-muted hover:text-risk-critical transition-colors p-2 opacity-0 group-hover:opacity-100">
                  <Trash2 size={18} />
                </button>
              </td>
            </tr>
          ))}
          {assets.length === 0 && (
            <tr>
              <td colSpan={5} className="px-8 py-20 text-center text-editorial-muted font-serif italic text-lg opacity-40">Zero Inventory Mapped</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
