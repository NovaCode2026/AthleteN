import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';

const c = Colors.dark;
const POLICY_VERSION = '2026-09-17';

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
  ['Acceptance', 'These Terms govern use of AthleteN, including the app, website, subscriptions, academy functions, AI features, and related services. Users must have legal capacity to agree, or use the service with required parent/guardian involvement.'],
  ['Accounts', 'Users should provide accurate information and protect their credentials. AthleteN may verify accounts, athletes, coaches, or academies when reasonably necessary for safety, security, eligibility, or fraud prevention.'],
  ['Features', 'AthleteN may provide athlete profiles, training records, tournaments, matches, medals, attendance, goals, documents, notifications, academy functions, analytics, messaging, and AI-assisted features. Features can change as the product evolves.'],
  ['AI features', 'AI output can be incomplete, inaccurate, or unsuitable for a particular athlete. AI is not a substitute for medical diagnosis, treatment, emergency care, sports medicine, physiotherapy, nutrition care, or qualified coaching.'],
  ['Sports and safety', 'AthleteN does not guarantee performance, competition results, injury prevention, selection, rankings, medals, or any particular outcome. Users remain responsible for applicable rules, coach instructions, medical advice, and safety requirements.'],
  ['User content', 'Users keep rights they lawfully own in content they submit. AthleteN receives only the permissions reasonably necessary to host, process, display, secure, and provide requested services, subject to the Privacy Policy and applicable law.'],
  ['Acceptable use', 'Users must not bypass authentication or security controls, access another person’s account, introduce malicious code, interfere with infrastructure, impersonate others, submit fraudulent verification, or use AthleteN unlawfully or to violate another person’s rights.'],
  ['Subscriptions and payments', 'Paid-plan pricing, billing intervals, taxes, included features, renewal, cancellation, and applicable refund terms are shown in the relevant plan or checkout flow. Payment providers may have their own terms.'],
  ['Suspension and termination', 'Access may be restricted when reasonably necessary for security, fraud prevention, legal compliance, protection of users, abuse prevention, or material breach, subject to applicable law and required notice or remedies.'],
  ['Availability and changes', 'AthleteN is an evolving service and may not always be uninterrupted or error-free. Material contractual changes will be handled according to applicable law.'],
  ['Privacy', 'Personal data is handled according to the AthleteN Privacy Policy and applicable data-protection law.'],
  ['Contact and disputes', 'AthleteN is provided by Nova Code. Contact: novacode.create@gmail.com. The current Terms use Indian law to the extent applicable, while preserving mandatory statutory rights and forums.'],
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
