import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzkCMEMStSVQjI3vxL-XWvSariaO4XqXDxm5guk2mOlYKLepCg1arYFSKAoDQPVBRP-/exec'
const API_VERSION = '2026-07-18-v4'
const STORAGE = 'homeVisitRecordsV2'
const CONFIG = 'homeVisitConfigV6'
const emptyForm = {
  recordId:'', createdAt:'', studentName:'', nickname:'', classLevel:'', room:'', studentNo:'', gender:'',
  villageName:'', houseNo:'', villageNo:'', soi:'', road:'', subdistrict:'', district:'', province:'สงขลา', postalCode:'',
  guardianName:'', guardianJob:'', guardianPhone:'', guardianRelation:'', parentStatus:'', incomePerPerson:'',
  hasDisease:'ไม่มี', diseaseDetail:'', distanceKm:'', distanceMeters:'', travelHours:'', travelMinutes:'', houseCondition:'',
  responsibilities:[], responsibilityOther:'', hobbies:'', riskBehaviors:[], riskDetail:'', supportNeeds:[], followUpNote:'',
  teacher1:'นางประไพ หนูเสือ', teacher2:'ว่าที่ร้อยตรีหญิงสุทธิดา แซ่หล่อ', visitDate:new Date().toISOString().slice(0,10), academicYear:'2569', studentPhoto:'', housePhoto:'', visitPhoto:''
}

const navItems = [['dashboard','⌂','ภาพรวม'],['form','＋','บันทึกใหม่'],['records','▤','รายการ'],['settings','⚙','ตั้งค่า']]
const fieldGroups = {
  responsibilities:['ช่วยงานบ้าน','ช่วยพ่อแม่หารายได้','อื่น ๆ'],
  riskBehaviors:['สารเสพติด','ทางเพศ','ความรุนแรง','ติดเกม/สื่อออนไลน์'],
  supportNeeds:['สอนการบ้าน','ให้เรียนพิเศษ','จัดหาสื่อ','ไม่มี'],
}

function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } }
function escText(value) { return String(value ?? '') }
function formatDate(value) { if (!value) return '-'; const date = new Date(value+'T00:00:00'); return Number.isNaN(+date) ? value : date.toLocaleDateString('th-TH') }
function shouldFollow(record) { return record.riskBehaviors?.length > 0 || record.houseCondition?.includes('ชำรุด') || record.supportNeeds?.some(x=>x!=='ไม่มี') || Boolean(record.followUpNote) }

async function callApi(config, idToken, payload) {
  const response = await fetch(config.url, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({...payload,idToken}) })
  const text = await response.text()
  let result
  try { result = JSON.parse(text) } catch { throw new Error('Apps Script ไม่ได้ตอบกลับเป็น JSON โปรดตรวจสอบสิทธิ์ Web App') }
  if (!result.ok) throw new Error(result.message || 'เกิดข้อผิดพลาดจาก Apps Script')
  return result
}

function decodeGoogleCredential(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')
    return JSON.parse(decodeURIComponent(atob(base64).split('').map(char=>'%'+char.charCodeAt(0).toString(16).padStart(2,'0')).join('')))
  } catch { return null }
}

function PortalChoice({onSelect}) {
  return <div className="screen-app grid min-h-screen place-items-center bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200 p-4"><div className="w-full max-w-4xl"><div className="mb-8 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#17365d] text-xl font-bold text-white">บย</div><h1 className="mt-4 text-3xl font-bold text-slate-900">ระบบบันทึกการเยี่ยมบ้านนักเรียน</h1><p className="mt-2 text-slate-500">โรงเรียนหาดใหญ่รัฐประชาสรรค์</p></div><div className="grid gap-5 md:grid-cols-2"><button onClick={()=>onSelect('student')} className="card group p-8 text-left transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-lg"><span className="grid h-12 w-12 place-items-center rounded-xl bg-blue-100 text-2xl">🎓</span><h2 className="mt-5 text-2xl font-bold text-[#17365d]">ระบบนักเรียนกรอกข้อมูล</h2><p className="mt-2 text-slate-500">กรอกแบบเยี่ยมบ้านและแนบรูปภาพ ส่งข้อมูลให้คุณครู</p><span className="mt-6 inline-block font-semibold text-blue-700">เข้าสู่แบบฟอร์ม →</span></button><button onClick={()=>onSelect('teacher')} className="card group p-8 text-left transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-lg"><span className="grid h-12 w-12 place-items-center rounded-xl bg-amber-100 text-2xl">👩‍🏫</span><h2 className="mt-5 text-2xl font-bold text-[#17365d]">ระบบคุณครู</h2><p className="mt-2 text-slate-500">เข้าสู่ระบบเพื่อดูรายการ แก้ไข และพิมพ์แบบบันทึก</p><span className="mt-6 inline-block font-semibold text-blue-700">เข้าสู่ระบบคุณครู →</span></button></div></div></div>
}

function GoogleLogin({clientId,onCredential,onSaveClientId,onBack,message}) {
  const buttonRef = useRef(null)
  const [draftClientId,setDraftClientId] = useState(clientId || '')
  const [error,setError] = useState('')
  useEffect(()=>{
    if (!clientId) return
    let attempts = 0
    const timer = setInterval(()=>{
      attempts += 1
      if (window.google?.accounts?.id && buttonRef.current) {
        clearInterval(timer)
        buttonRef.current.innerHTML = ''
        window.google.accounts.id.initialize({client_id:clientId,callback:response=>onCredential(response.credential)})
        window.google.accounts.id.renderButton(buttonRef.current,{theme:'outline',size:'large',shape:'pill',text:'signin_with',locale:'th',width:280})
      } else if (attempts > 50) { clearInterval(timer); setError('โหลด Google Sign-In ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต') }
    },100)
    return()=>clearInterval(timer)
  },[clientId,onCredential])
  return <div className="screen-app grid min-h-screen place-items-center bg-gradient-to-br from-slate-100 to-blue-100 p-4"><div className="card w-full max-w-md p-8 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#17365d] text-xl font-bold text-white">ครู</div><h1 className="mt-5 text-2xl font-bold text-slate-900">ระบบคุณครู</h1><p className="mt-2 text-sm text-slate-500">อนุญาตเฉพาะบัญชีคุณครูที่กำหนดไว้</p>{clientId?<div ref={buttonRef} className="mt-7 flex min-h-11 justify-center"/>:<div className="mt-7 text-left"><label className="field-label">Google OAuth Client ID</label><input className="field-input" value={draftClientId} onChange={e=>setDraftClientId(e.target.value)} placeholder="...apps.googleusercontent.com"/><button onClick={()=>onSaveClientId(draftClientId.trim())} className="mt-3 w-full rounded-xl bg-[#17365d] px-5 py-3 font-semibold text-white">บันทึก Client ID</button><p className="mt-3 text-xs text-slate-500">ตั้งค่าเพียงครั้งแรกบนอุปกรณ์นี้ หรือกำหนด VITE_GOOGLE_CLIENT_ID ใน .env.local</p></div>}{(error||message)&&<p className="mt-4 text-sm text-red-600">{error||message}</p>}<button onClick={onBack} className="mt-5 text-sm font-semibold text-slate-500">← กลับหน้าเลือกระบบ</button></div></div>
}

function resizeImage(file) {
  return new Promise((resolve,reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const image = new Image()
      image.onerror = reject
      image.onload = () => {
        const scale = Math.min(1, 1600/Math.max(image.width,image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.width*scale); canvas.height = Math.round(image.height*scale)
        canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height)
        resolve(canvas.toDataURL('image/jpeg',.78))
      }
      image.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

async function waitForPrintImages() {
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
  const images = [...document.querySelectorAll('.print-document img')]
  await Promise.all(images.map(image=>{
    if (typeof image.decode === 'function') return image.decode().catch(()=>{})
    if (image.complete) return Promise.resolve()
    return new Promise(resolve=>{ image.onload=resolve; image.onerror=resolve })
  }))
}

function Input({label,name,value,onChange,type='text',required=false,className=''}) {
  return <label className={className}><span className="field-label">{label}{required && <b className="text-red-600"> *</b>}</span><input className="field-input" name={name} type={type} value={value ?? ''} required={required} onChange={onChange}/></label>
}
function Select({label,name,value,onChange,children,required=false}) {
  return <label><span className="field-label">{label}{required && <b className="text-red-600"> *</b>}</span><select className="field-input" name={name} value={value ?? ''} required={required} onChange={onChange}>{children}</select></label>
}
function RadioGroup({label,name,value,options,onChange}) {
  return <div className="md:col-span-2"><span className="field-label">{label}</span><div className="flex flex-wrap gap-2">{options.map(option=><label className="choice" key={option}><input type="radio" name={name} value={option} checked={value===option} onChange={onChange}/>{option}</label>)}</div></div>
}
function CheckGroup({label,name,value=[],options,onToggle}) {
  return <div className="md:col-span-2"><span className="field-label">{label}</span><div className="flex flex-wrap gap-2">{options.map(option=><label className="choice" key={option}><input type="checkbox" checked={value.includes(option)} onChange={()=>onToggle(name,option)}/>{option}</label>)}</div></div>
}
function Section({number,title,children}) {
  return <section className="border-b border-slate-200 pb-6 last:border-0"><h3 className="mb-4 flex items-center gap-3 text-lg font-bold text-[#17365d]"><span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-sm">{number}</span>{title}</h3><div className="grid gap-4 md:grid-cols-2">{children}</div></section>
}
function PhotoUpload({label,hint,name,value,onChange}) {
  return <label className="relative grid min-h-52 cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 text-center text-slate-500 hover:border-blue-400">
    <input className="absolute inset-0 opacity-0" type="file" accept="image/*" capture="environment" onChange={e=>onChange(name,e.target.files?.[0])}/>
    {value ? <img className="h-52 w-full object-cover" src={value} alt={label}/> : <div><b className="block text-[#17365d]">{label}</b><small>{hint}</small></div>}
  </label>
}

function VisitForm({value,setValue,onSave,onCancel,saving}) {
  const change = e => setValue(current=>({...current,[e.target.name]:e.target.value}))
  const toggle = (name,option) => setValue(current=>({...current,[name]:current[name].includes(option)?current[name].filter(x=>x!==option):[...current[name],option]}))
  const photo = async (name,file) => { if (!file) return; if (file.size>12*1024*1024) return alert('รูปมีขนาดเกิน 12 MB'); const resized=await resizeImage(file); setValue(current=>({...current,[name]:resized})) }
  return <form onSubmit={onSave} className="card space-y-7 p-5 md:p-7">
    <Section number="1" title="ข้อมูลนักเรียน">
      <Input label="ชื่อ–สกุลนักเรียน" name="studentName" value={value.studentName} onChange={change} required/><Input label="ชื่อเล่น" name="nickname" value={value.nickname} onChange={change}/>
      <Select label="ชั้น" name="classLevel" value={value.classLevel} onChange={change} required><option value="">เลือกชั้น</option>{['ม.1','ม.2','ม.3','ม.4','ม.5','ม.6'].map(x=><option key={x}>{x}</option>)}</Select><Input label="ห้อง" name="room" type="number" value={value.room} onChange={change} required/>
      <Input label="เลขที่" name="studentNo" type="number" value={value.studentNo} onChange={change}/><RadioGroup label="เพศ" name="gender" value={value.gender} options={['ชาย','หญิง','อื่น ๆ']} onChange={change}/>
    </Section>
    <Section number="2" title="ที่อยู่ปัจจุบันและผู้ปกครอง">
      {['villageName:ชื่อหมู่บ้าน','houseNo:บ้านเลขที่','villageNo:หมู่ที่','soi:ซอย','road:ถนน','subdistrict:ตำบล','district:อำเภอ','province:จังหวัด','postalCode:รหัสไปรษณีย์'].map(item=>{const [name,label]=item.split(':');return <Input key={name} label={label} name={name} value={value[name]} onChange={change}/>})}
      <Input label="ชื่อ–สกุลผู้ปกครอง" name="guardianName" value={value.guardianName} onChange={change} required/><Input label="อาชีพ" name="guardianJob" value={value.guardianJob} onChange={change}/><Input label="เบอร์โทรศัพท์" name="guardianPhone" value={value.guardianPhone} onChange={change} required/><Input label="ความสัมพันธ์" name="guardianRelation" value={value.guardianRelation} onChange={change}/>
      <RadioGroup label="สถานภาพบิดา–มารดา" name="parentStatus" value={value.parentStatus} options={['อยู่ร่วมกัน','แยกกันอยู่','หย่าร้าง','บิดาเสียชีวิต','มารดาเสียชีวิต','บิดามารดาเสียชีวิต']} onChange={change}/><Input label="รายได้เฉลี่ยต่อคน (รวมรายได้ครัวเรือน หารด้วยจำนวนสมาชิกทั้งหมด) (บาท/เดือน)" name="incomePerPerson" type="number" value={value.incomePerPerson} onChange={change}/>
    </Section>
    <Section number="3" title="สุขภาพ การเดินทาง และสภาพบ้าน">
      <RadioGroup label="โรคประจำตัวนักเรียน" name="hasDisease" value={value.hasDisease} options={['ไม่มี','มี']} onChange={change}/><Input label="รายละเอียดโรคประจำตัว" name="diseaseDetail" value={value.diseaseDetail} onChange={change}/>
      <Input label="ระยะทางไป–กลับ (กิโลเมตร)" name="distanceKm" type="number" value={value.distanceKm} onChange={change}/><Input label="ระยะทางเพิ่มเติม (เมตร)" name="distanceMeters" type="number" value={value.distanceMeters} onChange={change}/><Input label="เวลาเดินทาง (ชั่วโมง)" name="travelHours" type="number" value={value.travelHours} onChange={change}/><Input label="เวลาเดินทาง (นาที)" name="travelMinutes" type="number" value={value.travelMinutes} onChange={change}/><RadioGroup label="สภาพบ้านที่อยู่อาศัย" name="houseCondition" value={value.houseCondition} options={['แข็งแรงปลอดภัย','ชำรุดทรุดโทรมหรือทำจากวัสดุพื้นบ้าน/วัสดุเหลือใช้']} onChange={change}/>
    </Section>
    <Section number="4" title="ภาระงาน พฤติกรรม และความต้องการช่วยเหลือ">
      <CheckGroup label="ภาระงานต่อครอบครัว" name="responsibilities" value={value.responsibilities} options={fieldGroups.responsibilities} onToggle={toggle}/><Input label="รายละเอียดภาระงานอื่น ๆ" name="responsibilityOther" value={value.responsibilityOther} onChange={change}/>
      <label className="md:col-span-2"><span className="field-label">กิจกรรมยามว่างหรืองานอดิเรก</span><textarea className="field-input min-h-24" name="hobbies" value={value.hobbies} onChange={change}/></label>
      <CheckGroup label="พฤติกรรมเสี่ยง" name="riskBehaviors" value={value.riskBehaviors} options={fieldGroups.riskBehaviors} onToggle={toggle}/><label className="md:col-span-2"><span className="field-label">รายละเอียดพฤติกรรมเสี่ยง</span><textarea className="field-input min-h-24" name="riskDetail" value={value.riskDetail} onChange={change}/></label>
      <CheckGroup label="การสนับสนุนด้านการเรียนที่ต้องการ" name="supportNeeds" value={value.supportNeeds} options={fieldGroups.supportNeeds} onToggle={toggle}/><label className="md:col-span-2"><span className="field-label">ข้อสังเกต/แนวทางช่วยเหลือเพิ่มเติม</span><textarea className="field-input min-h-24" name="followUpNote" value={value.followUpNote} onChange={change}/></label>
    </Section>
    <Section number="5" title="รูปถ่ายและผู้บันทึก">
      <div className="grid gap-3 md:col-span-2 md:grid-cols-3"><PhotoUpload label="รูปนักเรียน" hint="แตะเพื่อถ่ายหรือเลือกรูป" name="studentPhoto" value={value.studentPhoto} onChange={photo}/><PhotoUpload label="ภาพภายนอกบ้าน" hint="ให้เห็นหลังคาและฝาบ้าน" name="housePhoto" value={value.housePhoto} onChange={photo}/><PhotoUpload label="ภาพกิจกรรมเยี่ยมบ้าน" hint="ครู นักเรียน และผู้ปกครอง" name="visitPhoto" value={value.visitPhoto} onChange={photo}/></div>
      <Input label="ครูที่ปรึกษาคนที่ 1" name="teacher1" value={value.teacher1} onChange={change} required/><Input label="ครูที่ปรึกษาคนที่ 2" name="teacher2" value={value.teacher2} onChange={change}/><Input label="วันที่เยี่ยมบ้าน" name="visitDate" type="date" value={value.visitDate} onChange={change} required/><Input label="ปีการศึกษา" name="academicYear" value={value.academicYear} onChange={change}/>
    </Section>
    <div className="flex justify-end gap-3"><button type="button" onClick={onCancel} className="rounded-xl bg-slate-100 px-5 py-3 font-semibold text-slate-700">ล้างแบบฟอร์ม</button><button disabled={saving} className="rounded-xl bg-[#17365d] px-6 py-3 font-semibold text-white disabled:opacity-50">{saving?'กำลังบันทึก...':'บันทึกข้อมูล'}</button></div>
  </form>
}

const Fill = ({children,width='30mm',center=false}) => <span className={`a4-fill${center?' a4-fill-center':''}`} style={{width}}>{escText(children)}</span>
const Check = ({active}) => <span className="a4-check">{active?'(✓)':'( )'}</span>
const RiskOption = ({active,label,detail}) => <span className="a4-risk-option"><Check active={active}/><span>{label}</span><span>คือ</span><Fill>{detail}</Fill></span>
const thaiDigits = (value) => String(value ?? '').replace(/[0-9]/g, digit => '๐๑๒๓๔๕๖๗๘๙'[Number(digit)])
function PrintableForm({record}) {
  const r = record || emptyForm, status = r.parentStatus || ''
  const riskDetailFor = (risk) => r.riskBehaviors?.includes(risk) ? r.riskDetail : ''
  return <div className="print-document"><article className="a4-form">
    <header className="a4-header"><h1>แบบบันทึกการเยี่ยมบ้านนักเรียน ประจำปีการศึกษา <b>{thaiDigits(r.academicYear)}</b></h1><h2>โรงเรียนหาดใหญ่รัฐประชาสรรค์</h2></header>
    <div className="a4-student-photo">{r.studentPhoto?<img src={r.studentPhoto} alt="รูปนักเรียน"/>:'รูปถ่าย'}</div>
    <div className="a4-lines">
      <div className="a4-line">๑. ชื่อ - สกุลนักเรียน <Fill width="72mm">{r.studentName}</Fill> ชั้น <Fill width="17mm">{r.classLevel}</Fill> / <Fill width="15mm">{r.room}</Fill> ชื่อเล่น <Fill width="24mm">{r.nickname}</Fill></div>
      <div className="a4-line">๒. ที่อยู่ปัจจุบัน&nbsp;&nbsp;ชื่อหมู่บ้าน <Fill width="58mm">{r.villageName}</Fill> เลขที่ <Fill width="18mm">{r.houseNo}</Fill> ซอย <Fill width="36mm">{r.soi}</Fill> ถนน <Fill width="31mm">{r.road}</Fill></div>
      <div className="a4-line">&nbsp;&nbsp;&nbsp;&nbsp;หมู่ที่ <Fill width="21mm">{r.villageNo}</Fill> ตำบล <Fill width="36mm">{r.subdistrict}</Fill> อำเภอ <Fill width="38mm">{r.district}</Fill> จังหวัด <Fill width="35mm">{r.province}</Fill> รหัสไปรษณีย์ <Fill width="22mm">{r.postalCode}</Fill></div>
      <div className="a4-line">๓. ชื่อ - สกุล ผู้ปกครองนักเรียน <Fill width="77mm">{r.guardianName}</Fill> อาชีพ <Fill width="62mm">{r.guardianJob}</Fill></div>
      <div className="a4-line">&nbsp;&nbsp;&nbsp;&nbsp;เบอร์โทรศัพท์ <Fill width="52mm">{r.guardianPhone}</Fill> ความสัมพันธ์ของผู้ปกครองกับนักเรียน <Fill width="70mm">{r.guardianRelation}</Fill></div>
      <div className="a4-line">๔. สถานภาพบิดา - มารดา <Check active={status==='อยู่ร่วมกัน'}/> อยู่ร่วมกัน <Check active={status==='แยกกันอยู่'}/> แยกกันอยู่ <Check active={status==='หย่าร้าง'}/> หย่าร้าง <Check active={status==='บิดาเสียชีวิต'}/> บิดาเสียชีวิต <Check active={status==='มารดาเสียชีวิต'}/> มารดาเสียชีวิต <Check active={status==='บิดามารดาเสียชีวิต'}/> บิดามารดาเสียชีวิต</div>
      <div className="a4-line">๕. รายได้เฉลี่ยต่อคน (รวมรายได้ครัวเรือน หารด้วยจำนวนสมาชิกทั้งหมด) <Fill width="48mm" center>{r.incomePerPerson}</Fill> บาท / เดือน</div>
      <div className="a4-line">๖. โรคประจำตัวนักเรียน <Check active={r.hasDisease==='ไม่มี'}/> ไม่มีโรคประจำตัว <Check active={r.hasDisease==='มี'}/> มีโรคประจำตัว คือ <Fill width="72mm">{r.diseaseDetail}</Fill></div>
      <div className="a4-line">๗. ระยะทางระหว่างบ้านไปโรงเรียน (ไป/กลับ) <Fill width="18mm" center>{r.distanceKm}</Fill> กิโลเมตร <Fill width="18mm" center>{r.distanceMeters}</Fill> เมตร ใช้เวลาเดินทาง <Fill width="13mm" center>{r.travelHours}</Fill> ชม. <Fill width="13mm" center>{r.travelMinutes}</Fill> นาที</div>
      <div className="a4-line">๘. สภาพบ้านที่อยู่อาศัย ดังนี้</div>
      <div className="a4-line">&nbsp;&nbsp;&nbsp;&nbsp;<Check active={r.houseCondition==='แข็งแรงปลอดภัย'}/> สภาพบ้านแข็งแรงปลอดภัย</div>
      <div className="a4-line">&nbsp;&nbsp;&nbsp;&nbsp;<Check active={r.houseCondition?.includes('ชำรุด')}/> สภาพบ้านชำรุดทรุดโทรม หรือบ้านทำจากวัสดุพื้นบ้าน เช่น ไม้ไผ่ ใบจาก หรือวัสดุเหลือใช้</div>
      <div className="a4-line">๙. ภาระงานความรับผิดชอบของนักเรียนที่มีต่อครอบครัว</div>
      <div className="a4-line">&nbsp;&nbsp;&nbsp;&nbsp;<Check active={r.responsibilities?.includes('ช่วยงานบ้าน')}/> ช่วยงานบ้าน <Check active={r.responsibilities?.includes('ช่วยพ่อแม่หารายได้')}/> ช่วยพ่อแม่หารายได้ <Check active={r.responsibilities?.includes('อื่น ๆ')}/> อื่นๆ ระบุ <Fill width="66mm">{r.responsibilityOther}</Fill></div>
      <div className="a4-line">๑๐. กิจกรรมยามว่างหรืองานอดิเรก <Fill width="128mm">{r.hobbies}</Fill></div>
      <div className="a4-line a4-risk-pair"><span>๑๑. พฤติกรรมเสี่ยง</span><RiskOption active={r.riskBehaviors?.includes('สารเสพติด')} label="พฤติกรรมการใช้สารเสพติด" detail={riskDetailFor('สารเสพติด')}/><RiskOption active={r.riskBehaviors?.includes('ทางเพศ')} label="พฤติกรรมทางเพศ" detail={riskDetailFor('ทางเพศ')}/></div>
      <div className="a4-line a4-risk-pair"><span></span><RiskOption active={r.riskBehaviors?.includes('ความรุนแรง')} label="พฤติกรรมการใช้ความรุนแรง" detail={riskDetailFor('ความรุนแรง')}/><RiskOption active={r.riskBehaviors?.includes('ติดเกม/สื่อออนไลน์')} label="การติดเกม ติดสื่อออนไลน์" detail={riskDetailFor('ติดเกม/สื่อออนไลน์')}/></div>
      <div className="a4-line">๑๒. ต้องการการสนับสนุนในด้านการเรียน <Check active={r.supportNeeds?.includes('สอนการบ้าน')}/> สอนการบ้าน <Check active={r.supportNeeds?.includes('ให้เรียนพิเศษ')}/> ให้เรียนพิเศษ <Check active={r.supportNeeds?.includes('จัดหาสื่อ')}/> จัดหาสื่อ <Check active={r.supportNeeds?.includes('ไม่มี')}/> ไม่มีการสนับสนุน</div>
    </div>
    <div className="a4-photo-heading">ภาพกิจกรรมเยี่ยมบ้าน ภายนอกบ้านนักเรียน</div>
    <div className="a4-photo-grid"><div className="a4-photo-box">{r.housePhoto?<img src={r.housePhoto} alt="ภายนอกบ้าน"/>:'ภาพภายนอกบ้าน'}<div className="a4-photo-caption">รูปหลังคาและฝาบ้าน</div></div><div className="a4-photo-box">{r.visitPhoto?<img src={r.visitPhoto} alt="กิจกรรมเยี่ยมบ้าน"/>:'ภาพกิจกรรมเยี่ยมบ้าน'}<div className="a4-photo-caption">รูปหลังคาและฝาบ้าน</div></div></div>
    <div className="a4-cert">ขอรับรองว่าข้อมูลและภาพถ่ายของนักเรียนเป็นจริง</div>
    <div className="a4-signatures"><div>ลงชื่อ <span className="a4-sign-line"></span> <span className="a4-sign-role">ครูที่ปรึกษา</span><div className="a4-sign-name">( {r.teacher1} )</div></div><div>ลงชื่อ <span className="a4-sign-line"></span> <span className="a4-sign-role">ครูที่ปรึกษา</span><div className="a4-sign-name">( {r.teacher2} )</div></div></div>
  </article></div>
}

function App() {
  const storedConfig = readJson(CONFIG,{})
  const initialMode = window.location.hash === '#student' ? 'student' : window.location.hash === '#teacher' ? 'teacher' : ''
  const [mode,setMode] = useState(initialMode)
  const [config,setConfig] = useState({url:SCRIPT_URL,clientId:storedConfig.clientId||import.meta.env.VITE_GOOGLE_CLIENT_ID||''})
  const [credential,setCredential] = useState(()=>sessionStorage.getItem('homeVisitGoogleIdToken')||'')
  const user = useMemo(()=>decodeGoogleCredential(credential),[credential])
  const isAdmin = ['ta458@hatyairat.ac.th','jaeautobot@gmail.com'].includes(String(user?.email||'').toLowerCase())
  const [view,setView] = useState('form'), [records,setRecords] = useState([]), [form,setForm] = useState(emptyForm), [printing,setPrinting] = useState(null), [saving,setSaving] = useState(false), [message,setMessage] = useState('')
  const [deletingId,setDeletingId] = useState('')
  const previewMode = new URLSearchParams(window.location.search).has('print-preview')
  const acceptCredential = useCallback(token=>{sessionStorage.setItem('homeVisitGoogleIdToken',token);setCredential(token)},[])
  const logout = useCallback(()=>{sessionStorage.removeItem('homeVisitGoogleIdToken');setCredential('');setRecords([]);setPrinting(null);window.google?.accounts?.id?.disableAutoSelect()},[])
  const selectMode = selected => { setMode(selected);window.location.hash=selected;setMessage('');setView(selected==='teacher'?'dashboard':'form') }
  const backToPortal = () => { logout();setMode('');window.history.replaceState(null,'',window.location.pathname+window.location.search);setMessage('') }
  useEffect(()=>{ document.body.classList.toggle('print-preview-mode',previewMode); return()=>document.body.classList.remove('print-preview-mode') },[previewMode])
  useEffect(()=>{
    if (mode !== 'teacher' || !credential || !user) return
    callApi(config,credential,{action:'ping'}).then(result=>{
      if (result.apiVersion !== API_VERSION) throw new Error(`Apps Script ยังเป็นเวอร์ชันเก่า กรุณา Deploy เวอร์ชัน ${API_VERSION}`)
      if (result.user?.isAdmin) {
        setView('dashboard')
        return callApi(config,credential,{action:'list'}).then(list=>setRecords(list.data||[]))
      }
      setView('form'); setRecords([])
    }).catch(error=>{setMessage(error.message);logout()})
  },[credential,mode])
  const stats = useMemo(()=>({total:records.length,male:records.filter(x=>x.gender==='ชาย').length,female:records.filter(x=>x.gender==='หญิง').length,follow:records.filter(shouldFollow).length}),[records])
  const save = async event => {
    event.preventDefault(); setSaving(true); setMessage('')
    const data={...form,recordId:form.recordId||'HV-'+Date.now(),createdAt:form.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()}
    try {
      const action = mode === 'teacher' ? 'saveTeacher' : 'saveStudent'
      const saved=(await callApi(config,mode==='teacher'?credential:'',{action,data})).data
      if (mode === 'teacher') {
        setRecords(current=>[saved,...current.filter(x=>x.recordId!==saved.recordId)])
        setView('records'); setForm(emptyForm); setMessage('บันทึกลง Google Sheet และ Drive แล้ว')
      } else {
        setForm(emptyForm)
        window.alert('บันทึกข้อมูลเรียบร้อย')
        backToPortal()
      }
    } catch(error) { setMessage(error.message) } finally { setSaving(false) }
  }
  const printRecord = async record => {
    if (!isAdmin) return
    setMessage('กำลังเตรียมข้อมูลและรูปภาพสำหรับพิมพ์...')
    try {
      const result = await callApi(config,credential,{action:'getPrintRecord',recordId:record.recordId})
      setPrinting(result.data)
      await waitForPrintImages()
      setMessage('')
      window.print()
    } catch(error) { setMessage(error.message) }
  }
  const deleteRecord = async record => {
    if (!isAdmin || !window.confirm(`ยืนยันลบรายงานของ ${record.studentName || 'นักเรียน'} ใช่หรือไม่?\nรูปภาพที่เกี่ยวข้องจะถูกย้ายไปถังขยะใน Google Drive`)) return
    setDeletingId(record.recordId); setMessage('')
    try {
      await callApi(config,credential,{action:'deleteTeacher',recordId:record.recordId})
      setRecords(current=>current.filter(item=>item.recordId!==record.recordId))
      if (printing?.recordId === record.recordId) setPrinting(null)
      setMessage('ลบรายงานเรียบร้อยแล้ว')
    } catch(error) { setMessage(error.message) } finally { setDeletingId('') }
  }
  const edit = record => { if(!isAdmin)return;setForm({...emptyForm,...record});setView('form') }
  const persistConfig = async test => {
    localStorage.setItem(CONFIG,JSON.stringify(config))
    if (!test) return setMessage('บันทึกการตั้งค่าแล้ว')
    try { await callApi(config,credential,{action:'ping'});setMessage('เชื่อมต่อ Google Apps Script สำเร็จ') } catch(error) { setMessage(error.message) }
  }
  const saveClientId = clientId => { const next={...config,clientId};setConfig(next);localStorage.setItem(CONFIG,JSON.stringify(next)) }

  if (!mode) return <PortalChoice onSelect={selectMode}/>
  if (mode === 'teacher' && !user) return <GoogleLogin clientId={config.clientId} onCredential={acceptCredential} onSaveClientId={saveClientId} onBack={backToPortal} message={message}/>
  const visibleNav = mode === 'teacher' ? navItems : navItems.filter(([id])=>id==='form')
  return <><div className="screen-app min-h-screen bg-slate-100">
    <header className="sticky top-0 z-30 bg-gradient-to-r from-[#17365d] to-[#23679f] text-white shadow-lg"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3"><div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-white font-bold text-[#17365d]">{mode==='teacher'?'ครู':'นร'}</div><div><h1 className="font-bold">{mode==='teacher'?'ระบบคุณครู':'ระบบนักเรียนกรอกข้อมูล'}</h1><p className="text-xs text-blue-100">โรงเรียนหาดใหญ่รัฐประชาสรรค์</p></div></div><div className="flex items-center gap-3"><nav className="flex gap-1">{visibleNav.map(([id,icon,label])=><button key={id} onClick={()=>setView(id)} className={`rounded-xl px-3 py-2 text-sm ${view===id?'bg-white text-[#17365d]':'hover:bg-white/10'}`}>{icon} <span className="hidden sm:inline">{label}</span></button>)}</nav>{mode==='teacher'&&<div className="hidden text-right text-xs sm:block"><b>{user?.name||user?.email}</b><div className="text-blue-100">ผู้ดูแลระบบ</div></div>}<button onClick={backToPortal} className="rounded-xl border border-white/30 px-3 py-2 text-xs">{mode==='teacher'?'ออกจากระบบ':'กลับหน้าแรก'}</button></div></div></header>
    <main className="mx-auto max-w-7xl px-4 py-7">{message&&<div className="mb-5 flex justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"><span>{message}</span><button onClick={()=>setMessage('')}>×</button></div>}
      {isAdmin&&view==='dashboard'&&<><div className="mb-6 flex items-end justify-between"><div><h2 className="text-3xl font-bold text-slate-900">ภาพรวมการเยี่ยมบ้าน</h2><p className="text-slate-500">เฉพาะผู้ดูแลระบบที่ได้รับอนุญาต</p></div><button onClick={()=>setView('form')} className="rounded-xl bg-[#17365d] px-5 py-3 font-semibold text-white">＋ บันทึกใหม่</button></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['บันทึกทั้งหมด',stats.total],['นักเรียนชาย',stats.male],['นักเรียนหญิง',stats.female],['ควรติดตามช่วยเหลือ',stats.follow]].map(([label,value])=><div className="card p-5" key={label}><p className="text-sm text-slate-500">{label}</p><strong className="mt-2 block text-4xl text-[#17365d]">{value}</strong><small className="text-slate-400">รายการ</small></div>)}</div><div className="card mt-5 p-5"><h3 className="mb-3 text-lg font-bold">บันทึกล่าสุด</h3>{records.slice(0,5).map(record=><div key={record.recordId} className="flex justify-between border-b border-slate-100 py-3 last:border-0"><div><b>{record.studentName}</b><p className="text-sm text-slate-500">{record.classLevel}/{record.room} · {formatDate(record.visitDate)}</p></div><button onClick={()=>printRecord(record)} className="text-sm font-semibold text-blue-700">พิมพ์ฟอร์ม</button></div>)}{!records.length&&<p className="py-8 text-center text-slate-400">ยังไม่มีข้อมูล</p>}</div></>}
      {view==='form'&&<><div className="mb-5 flex items-end justify-between gap-4"><div><h2 className="text-3xl font-bold text-slate-900">{form.recordId?'แก้ไขข้อมูล':'บันทึกการเยี่ยมบ้าน'}</h2><p className="text-slate-500">{mode==='teacher'?`บัญชี ${user?.email} · ผู้ดูแลระบบ`:'ระบบสำหรับนักเรียนกรอกและส่งข้อมูลให้คุณครู'}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${mode==='teacher'?'bg-emerald-100 text-emerald-700':'bg-blue-100 text-blue-700'}`}>{mode==='teacher'?'● ยืนยันบัญชี Google แล้ว':'● ส่งข้อมูลอย่างเดียว'}</span></div><VisitForm value={form} setValue={setForm} onSave={save} onCancel={()=>setForm(emptyForm)} saving={saving}/></>}
      {isAdmin&&view==='records'&&<><div className="mb-5 flex items-end justify-between"><div><h2 className="text-3xl font-bold text-slate-900">รายการเยี่ยมบ้าน</h2><p className="text-slate-500">เฉพาะอีเมลผู้ดูแลที่ได้รับอนุญาต</p></div><button onClick={()=>setView('form')} className="rounded-xl bg-[#17365d] px-5 py-3 font-semibold text-white">＋ เพิ่มรายการ</button></div><div className="card overflow-x-auto"><table className="w-full min-w-3xl text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr>{['วันที่','นักเรียน','ชั้น/ห้อง','ผู้ปกครอง','ผู้บันทึก','สถานะ','จัดการ'].map(x=><th className="px-4 py-3" key={x}>{x}</th>)}</tr></thead><tbody>{records.map(record=><tr className="border-t border-slate-100" key={record.recordId}><td className="px-4 py-3">{formatDate(record.visitDate)}</td><td className="px-4 py-3 font-semibold">{record.studentName}</td><td className="px-4 py-3">{record.classLevel}/{record.room}</td><td className="px-4 py-3">{record.guardianName}</td><td className="px-4 py-3 text-xs">{record.submittedBy||'-'}</td><td className="px-4 py-3">{shouldFollow(record)?'ควรติดตาม':'ทั่วไป'}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-2"><button onClick={()=>edit(record)} className="rounded-lg bg-slate-100 px-3 py-2">แก้ไข</button><button onClick={()=>printRecord(record)} className="rounded-lg bg-[#17365d] px-3 py-2 text-white">พิมพ์ฟอร์ม</button><button onClick={()=>deleteRecord(record)} disabled={deletingId===record.recordId} className="rounded-lg bg-red-50 px-3 py-2 font-semibold text-red-700 disabled:opacity-50">{deletingId===record.recordId?'กำลังลบ...':'ลบ'}</button></div></td></tr>)}</tbody></table>{!records.length&&<p className="py-12 text-center text-slate-400">ยังไม่มีข้อมูล</p>}</div></>}
      {isAdmin&&view==='settings'&&<div className="card max-w-3xl p-6"><h2 className="text-2xl font-bold text-slate-900">ตั้งค่าการเชื่อมต่อ</h2><p className="mt-2 text-sm text-slate-500">เฉพาะผู้ดูแลระบบ</p><div className="mt-6 space-y-4"><Input label="Apps Script Web App URL" name="url" value={config.url} onChange={e=>setConfig(x=>({...x,url:e.target.value}))}/><Input label="Google OAuth Client ID" name="clientId" value={config.clientId} onChange={e=>setConfig(x=>({...x,clientId:e.target.value}))}/><div className="flex gap-3"><button onClick={()=>persistConfig(false)} className="rounded-xl bg-[#17365d] px-5 py-3 font-semibold text-white">บันทึกการตั้งค่า</button><button onClick={()=>persistConfig(true)} className="rounded-xl border border-slate-300 px-5 py-3 font-semibold">ทดสอบการเชื่อมต่อ</button></div></div></div>}
    </main></div><PrintableForm record={printing}/></>
}

export default App
