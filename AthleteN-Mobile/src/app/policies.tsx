import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';

const c = Colors.dark;
const POLICY_VERSION = '2026-10-12';

const privacySections = [
  ['What we collect', 'Depending on the features you use, AthleteN may collect account information, athlete profile information, training and performance information, messages and reports, connected-service information, transaction status, and technical/security information.'],
  ['How we use information', 'We use information to operate accounts and features, provide athlete/coach/academy functionality, authenticate users, process subscriptions, provide requested integrations, support users, prevent abuse, and improve reliability and performance.'],
  ['Sharing', 'AthleteN does not sell personal information as a standalone data product. Information may be processed by service providers that operate hosting, authentication, databases, payments, email, AI, analytics/diagnostics, and other infrastructure, or shared when you request a connected integration or when legally required.'],
  ['Shared information', 'Information can be visible to other authorized users when you use profile, messaging, coach, academy, team, or other sharing features. Do not submit information you do not want an authorized recipient to see.'],
  ['Children and teens', 'AthleteN includes age-safety controls for younger users. Where required, age verification and parent/guardian approval workflows may apply. We aim to collect only information reasonably necessary for the service.'],
  ['Security', 'We use reasonable technical and organizational safeguards, including authenticated access and access controls. No online service can guarantee absolute security.'],
  ['Retention', 'Information is retained as reasonably necessary for the service, security, account and transaction records, dispute handling, and legal obligations. Retention periods can differ by data type.'],
  ['Your choices', 'Depending on applicable law, users may have rights to access, correct, export, restrict, or delete certain information and to withdraw consent where processing is based on consent. Privacy requests can be sent to novacode.create@gmail.com.'],
  ['Changes', 'The Privacy Policy may change when services, practices, or legal requirements change. Material changes will be communicated where appropriate and where law requires notice or consent.'],
];

const termSections = [
  ["Agreement and scope", "These Terms cover AthleteN website, mobile apps, APIs, athlete tools, coach/academy workspaces, scanner, messaging, subscriptions and related services. Acceptance must be affirmative where law requires it. Mandatory Indian law prevails. See the full website Terms of Service."],
  ["Eligibility and minors", "Contractual capacity is governed by applicable law, including section 11 of the Indian Contract Act, 1872. Users under 18 must not be treated as independently entering binding commercial contracts merely by tapping Accept. Parent/guardian authorisation and separate legally required personal-data consent must be obtained. Applicable child safeguards must be implemented before relevant processing."],
  ["Accounts and roles", "Provide accurate details and protect credentials. Athlete, coach, academy, admin and super-admin permissions are limited to backend-authorised capabilities. Do not share privileged accounts or access another person’s records without authority."],
  ["Features and availability", "Depending on plan and availability, AthleteN may provide profiles, training, attendance, competitions, medals, documents, weight/performance records, messaging, analytics, coach/academy workspaces, AI tools, scanner and subscriptions. Features may change subject to applicable law and purchase terms."],
  ["Sports, health and AI safety", "AthleteN is not a medical device or substitute for a qualified coach, doctor, physiotherapist, dietitian or emergency service. AI/scanner outputs may be wrong and do not guarantee performance, selection, medals, eligibility or injury prevention. Do not rely on AthleteN alone for safety-critical training, injury, medication or food decisions."],
  ["User content and permissions", "You retain rights you lawfully own and must have permission to submit images, documents and other people’s data. AthleteN receives only the limited permissions needed to operate the requested feature, subject to its Privacy Policy and law."],
  ["Acceptable use and reports", "No unlawful use, harassment, impersonation, fraudulent verification, malware, unauthorised access, scraping personal/protected data, or harm to children/users. Report abuse, privacy or security concerns through available controls or novacode.create@gmail.com."],
  ["Intellectual property", "AthleteN’s operator-owned software, branding and content remain protected. Use is limited to the intended service; third-party components follow their own licences."],
  ["Subscriptions, billing and refunds", "Before purchase, checkout must disclose price/currency, billing period, features/limits, taxes/fees, renewal, cancellation and refund terms. Recurring payments require affirmative consent and applicable payment-rule compliance. Consumer rights and mandatory refunds cannot be waived by a blanket no-refund term."],
  ["Third parties and data", "AthleteN may rely on hosting, authentication, storage, AI, payment and other providers. Personal data is handled under the Privacy Policy and applicable Indian law, including relevant IT Act 2000 and DPDP Act 2023/Rules 2025 provisions as they commence and apply."],
  ["Grievances and intermediary rules", "Where applicable, AthleteN will follow duties under the IT Act 2000 and IT (Intermediary Guidelines and Digital Media Ethics Code) Rules 2021 as amended. Required grievance officer details must be real and published before launch. Current contact: novacode.create@gmail.com."],
  ["Suspension, deletion and liability", "Access may be restricted for security, abuse, fraud, unlawful use or legal compliance, subject to required process. Account deletion may be requested using available controls or by email; lawful records may be retained. Nothing excludes non-waivable consumer or statutory rights."],
  ["Law and operator details", "Indian law applies subject to mandatory law and lawful jurisdiction. Operator currently identified as Nova Code; contracting legal identity, valid business address, support process and any required grievance officer details must be completed before public/commercial launch. Contact: novacode.create@gmail.com."],
];

export default function PoliciesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<'privacy' | 'terms'>(params.tab === 'terms' ? 'terms' : 'privacy');
  const sections = tab === 'privacy' ? privacySections : termSections;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ BACK</Text></Pressable>
        <View>
          <Text style={styles.kicker}>ATHLETEN POLICIES</Text>
          <Text style={styles.title}>Policies &amp; rules</Text>
        </View>
        <Text style={styles.version}>v{POLICY_VERSION}</Text>
      </View>

      <View style={styles.tabs}>
        <Pressable onPress={() => setTab('privacy')} style={[styles.tab, tab === 'privacy' && styles.activeTab]}>
          <Text style={[styles.tabText, tab === 'privacy' && styles.activeTabText]}>PRIVACY</Text>
        </Pressable>
        <Pressable onPress={() => setTab('terms')} style={[styles.tab, tab === 'terms' && styles.activeTab]}>
          <Text style={[styles.tabText, tab === 'terms' && styles.activeTabText]}>TERMS</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>{tab === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}</Text>
          <Text style={styles.noticeText}>
            {tab === 'privacy'
              ? 'How AthleteN handles information, security, sharing, retention and user choices.'
              : 'The rules for using AthleteN, including accounts, AI, safety, subscriptions and acceptable use.'}
          </Text>
        </View>

        {sections.map(([heading, body]) => (
          <View key={heading} style={styles.section}>
            <Text style={styles.heading}>{heading}</Text>
            <Text style={styles.body}>{body}</Text>
          </View>
        ))}

        <View style={styles.contact}>
          <Text style={styles.contactTitle}>Questions or privacy requests?</Text>
          <Text style={styles.body}>Email novacode.create@gmail.com</Text>
        </View>

        <Text style={styles.footer}>
          Current production policy documents should be reviewed and finalized with appropriate legal advice before commercial launch, especially for minors, payments, consumer rights and the provider’s exact legal identity.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:c.background},
  header:{paddingHorizontal:20,paddingTop:10,paddingBottom:14,flexDirection:'row',alignItems:'center',gap:14},
  back:{color:c.accentBright,fontSize:10,fontWeight:'900',letterSpacing:1},
  kicker:{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1.5},
  title:{color:c.text,fontSize:24,fontWeight:'900',marginTop:3},
  version:{marginLeft:'auto',color:c.muted,fontSize:9,fontWeight:'800'},
  tabs:{flexDirection:'row',marginHorizontal:20,backgroundColor:c.surface,borderRadius:14,borderWidth:1,borderColor:c.border,padding:4},
  tab:{flex:1,paddingVertical:12,alignItems:'center',borderRadius:10},
  activeTab:{backgroundColor:c.accent},
  tabText:{color:c.muted,fontSize:10,fontWeight:'900',letterSpacing:1},
  activeTabText:{color:'#fff'},
  content:{padding:20,paddingBottom:48},
  notice:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:18,padding:17,marginBottom:8},
  noticeTitle:{color:c.text,fontSize:18,fontWeight:'900'},
  noticeText:{color:c.muted,fontSize:12,lineHeight:19,marginTop:6},
  section:{paddingVertical:14,borderBottomWidth:1,borderBottomColor:c.border},
  heading:{color:c.text,fontSize:14,fontWeight:'900',marginBottom:6},
  body:{color:c.muted,fontSize:12,lineHeight:19},
  contact:{marginTop:20,padding:17,borderRadius:16,backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong},
  contactTitle:{color:c.text,fontSize:13,fontWeight:'900',marginBottom:5},
  footer:{color:c.muted,fontSize:10,lineHeight:16,marginTop:20},
});
