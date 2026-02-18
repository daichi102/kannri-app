'use client'

import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from '@react-pdf/renderer'

import type { Project } from '@/lib/types/project'

type CheckRow = { floor: boolean; wall: boolean; other: boolean }
export type CompletionCheckFormData = {
  inquiry_number: string
  worker_name: string
  retailer: string
  product_code: string
  serial_number: string
  installation_date: string
  installation_time: string
  partner_company: string
  change_notes: string
  customer_name: string
  customer_signature_data_url?: string | null
  delivery_checks: CheckRow[]
  completion_checks: CheckRow[]
  elevator: 'none' | 'yes'
  installation_floor: string
  stairs_location: 'indoor' | 'outdoor'
  stairs_steps: string
  warranty: 'take_home' | 'customer_retailer'
  carry_out: 'none' | 'yes'
  refrigerator: '' | '400l_or_less' | '500l_or_more'
  washing_machine: '' | 'vertical' | 'drum'
  option_unic: boolean
  option_high_altitude: boolean
  option_door_window: boolean
  option_special: boolean
  option_counter: boolean
  option_recycling: boolean
}

type ProjectWithNames = Project & {
  customer?: { name: string } | null
  staff?: { name: string } | null
}

const DELIVERY_ITEMS = [
  '① 開梱時、商品のキズ確認(キズがある場合、写真)',
  '② お客様立会いのもと、商品のキズ確認',
  '③ 商品の搬入前ルート確認',
  '④ 商品設置場所周囲のキズ確認(キズがある場合、写真)',
]
const COMPLETION_ITEMS = [
  '① お客様による商品の設置状況確認',
  '② 設置後、商品のキズの確認(キズがある場合、写真)',
  '③ 試運転をお客様立会いのもとで実施',
  '④ 給水栓の水漏れ、排水ホースの立上り確認',
  '⑤ 設置場所周辺、搬入ルート等の清掃(ゴミ、戸締り等)',
  '⑥ 商品搬入後ルート確認(キズがある場合、写真)',
  '⑦ 商品設置状況の説明・商品の簡易取り扱い説明',
]

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 9 },
  title: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  note: { fontSize: 8, marginBottom: 12, color: '#666' },
  sectionTitle: { fontSize: 10, fontWeight: 'bold', marginBottom: 6, marginTop: 8 },
  row: { flexDirection: 'row', marginBottom: 4 },
  label: { width: 100, fontSize: 8 },
  value: { flex: 1, fontSize: 9 },
  table: { marginTop: 6 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ccc', paddingVertical: 4 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#333', paddingVertical: 4, fontWeight: 'bold' },
  col1: { flex: 1, fontSize: 8 },
  col2: { width: 28, textAlign: 'center', fontSize: 8 },
  col3: { width: 28, textAlign: 'center', fontSize: 8 },
  col4: { width: 28, textAlign: 'center', fontSize: 8 },
  check: { fontSize: 10 },
  signatureBox: { marginTop: 8, borderWidth: 0.5, borderColor: '#999', padding: 8, minHeight: 40 },
  smallNote: { fontSize: 7, marginTop: 4, color: '#666' },
})

function CheckMark({ v }: { v: boolean }) {
  return <Text style={styles.check}>{v ? '〇' : '－'}</Text>
}

export default function CompletionCheckPdfDocument({
  project,
  form,
}: {
  project: ProjectWithNames
  form: CompletionCheckFormData
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>作業確認チェック表</Text>
        <Text style={styles.note}>※全項目が抜け漏れないようチェックをお願い致します。</Text>

        <Text style={styles.sectionTitle}>【基本情報】</Text>
        <View style={styles.row}><Text style={styles.label}>問い合わせ番号</Text><Text style={styles.value}>{form.inquiry_number || '－'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>作業担当者</Text><Text style={styles.value}>{form.worker_name || project.staff?.name || '－'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>販売店</Text><Text style={styles.value}>{form.retailer || '－'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>設置商品(品番)</Text><Text style={styles.value}>{form.product_code || project.product_code || '－'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>製造番号</Text><Text style={styles.value}>{form.serial_number || '－'}</Text></View>

        <Text style={styles.sectionTitle}>【商品搬入時】</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.col1}>確認事項</Text>
            <Text style={styles.col2}>床</Text>
            <Text style={styles.col3}>壁</Text>
            <Text style={styles.col4}>その他</Text>
          </View>
          {DELIVERY_ITEMS.map((label, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.col1}>{label}</Text>
              <View style={styles.col2}><CheckMark v={form.delivery_checks?.[i]?.floor} /></View>
              <View style={styles.col3}><CheckMark v={form.delivery_checks?.[i]?.wall} /></View>
              <View style={styles.col4}><CheckMark v={form.delivery_checks?.[i]?.other} /></View>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>【作業終了後】</Text>
        <Text style={styles.smallNote}>※搬入ルート等、キズがある場合は、お客様に確認して頂くこと。</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.col1}>確認事項</Text>
            <Text style={styles.col2}>床</Text>
            <Text style={styles.col3}>壁</Text>
            <Text style={styles.col4}>その他</Text>
          </View>
          {COMPLETION_ITEMS.map((label, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.col1}>{label}</Text>
              <View style={styles.col2}><CheckMark v={form.completion_checks?.[i]?.floor} /></View>
              <View style={styles.col3}><CheckMark v={form.completion_checks?.[i]?.wall} /></View>
              <View style={styles.col4}><CheckMark v={form.completion_checks?.[i]?.other} /></View>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>【設置環境・搬出】</Text>
        <View style={styles.row}><Text style={styles.label}>エレベーター</Text><Text style={styles.value}>{form.elevator === 'yes' ? '有' : '無'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>設置階数</Text><Text style={styles.value}>{form.installation_floor || '－'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>階段</Text><Text style={styles.value}>{form.stairs_location === 'outdoor' ? '屋外' : '屋内'} {form.stairs_steps ? form.stairs_steps + '段' : ''}</Text></View>
        <View style={styles.row}><Text style={styles.label}>保証書</Text><Text style={styles.value}>{form.warranty === 'customer_retailer' ? 'お客様/販売店口' : '持ち帰り口'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>搬出品</Text><Text style={styles.value}>{form.carry_out === 'yes' ? '有' : '無'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>冷蔵庫</Text><Text style={styles.value}>{form.refrigerator === '500l_or_more' ? '500Lクラス以上' : form.refrigerator === '400l_or_less' ? '400Lクラス以下' : '－'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>洗濯機</Text><Text style={styles.value}>{form.washing_machine === 'drum' ? 'ドラム式' : form.washing_machine === 'vertical' ? '縦型' : '－'}</Text></View>

        <Text style={styles.sectionTitle}>【オプション】</Text>
        <Text style={styles.value}>
          {[form.option_unic && 'ユニック作業', form.option_high_altitude && '高所作業', form.option_door_window && 'ドア・窓・手すり外し', form.option_special && '特殊作業', form.option_counter && 'カウンター越え', form.option_recycling && 'リサイクル有口'].filter(Boolean).join('　') || '－'}
        </Text>
        {form.change_notes ? <Text style={{ ...styles.value, marginTop: 4 }}>変更内容・備考: {form.change_notes}</Text> : null}

        <Text style={styles.sectionTitle}>【設置日時・協力会社】</Text>
        <View style={styles.row}><Text style={styles.label}>設置日</Text><Text style={styles.value}>{form.installation_date || '－'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>設置時間</Text><Text style={styles.value}>{form.installation_time || '－'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>協力会社</Text><Text style={styles.value}>{form.partner_company || '－'}</Text></View>

        <Text style={styles.sectionTitle}>【お客様署名】</Text>
        <Text style={styles.smallNote}>※商品の設置完了後、チェック項目と以下のお願いを確認し、ご署名・捺印ください。</Text>
        <View style={styles.row}><Text style={styles.label}>お客様名（姓）</Text><Text style={styles.value}>{form.customer_name || '－'}</Text></View>
        <View style={styles.signatureBox}>
          {form.customer_signature_data_url ? (
            <Image src={form.customer_signature_data_url} style={{ maxWidth: 200, maxHeight: 60 }} />
          ) : (
            <Text style={styles.smallNote}>（署名欄）</Text>
          )}
        </View>
      </Page>
    </Document>
  )
}
