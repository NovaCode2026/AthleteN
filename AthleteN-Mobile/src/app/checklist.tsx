import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Screen, Header, Section, Card, Field, Button, Empty, c } from '@/components/mobile-ui';

export default function ChecklistScreen() {
  const { session } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [item, setItem] = useState('');
  const [category, setCategory] = useState('equipment');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('competition_checklists')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true });
    setItems(data || []);
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!session || !item.trim()) return;
    setBusy(true);
    setMessage('');

    const { error } = await supabase.from('competition_checklists').insert({
      user_id: session.user.id,
      item: item.trim(),
      category: category.trim() || 'general',
      completed: false,
    });

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setItem('');
    setMessage('Checklist item added.');
    await load();
  }

  async function toggle(x: any) {
    if (!session) return;
    const { error } = await supabase
      .from('competition_checklists')
      .update({ completed: !x.completed })
      .eq('id', x.id)
      .eq('user_id', session.user.id);

    if (error) {
      setMessage(error.message);
      return;
    }
    await load();
  }

  async function remove(x: any) {
    if (!session) return;
    const { error } = await supabase
      .from('competition_checklists')
      .delete()
      .eq('id', x.id)
      .eq('user_id', session.user.id);

    if (error) {
      setMessage(error.message);
      return;
    }
    await load();
  }

  return (
    <Screen>
      <Header
        eyebrow="COMPETITION READY"
        title="Checklist"
        subtitle="Prepare for every tournament without forgetting the small stuff."
      />

      <Section title="ADD ITEM">
        <Card>
          <Field
            label="ITEM"
            value={item}
            onChangeText={setItem}
            placeholder="Dobok / protector / passport"
          />
          <Field
            label="CATEGORY"
            value={category}
            onChangeText={setCategory}
            placeholder="Equipment"
          />
          <Button
            title="ADD CHECKLIST ITEM"
            onPress={() => void add()}
            busy={busy}
          />
        </Card>
        {message ? (
          <Text style={{ color: c.accentBright, fontSize: 11 }}>
            {message}
          </Text>
        ) : null}
      </Section>

      <Section title="YOUR CHECKLIST">
        {items.length > 0 ? (
          items.map((x) => (
            <Card key={x.id}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <Pressable
                  onPress={() => void toggle(x)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    borderWidth: 1,
                    borderColor: x.completed ? c.accent : c.border,
                    backgroundColor: x.completed ? c.accent : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '900' }}>
                    {x.completed ? '✓' : ''}
                  </Text>
                </Pressable>

                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: x.completed ? c.muted : c.text,
                      fontSize: 13,
                      fontWeight: '900',
                      textDecorationLine: x.completed ? 'line-through' : 'none',
                    }}
                  >
                    {x.item}
                  </Text>
                  <Text style={{ color: c.muted, fontSize: 9 }}>
                    {x.category}
                  </Text>
                </View>

                <Pressable onPress={() => void remove(x)}>
                  <Text style={{ color: c.danger, fontSize: 8, fontWeight: '900' }}>
                    DELETE
                  </Text>
                </Pressable>
              </View>
            </Card>
          ))
        ) : (
          <Empty text="Your competition checklist is empty." />
        )}
      </Section>
    </Screen>
  );
}
