import pickle
import sys

import libraries.stripe
from libraries.stripe import util
from libraries.stripe.test.helper import StripeUnitTestCase, SAMPLE_INVOICE


class StripeObjectTests(StripeUnitTestCase):

    def test_initializes_with_parameters(self):
        obj = libraries.stripe.resource.StripeObject(
            'foo', 'bar', myparam=5, yourparam='boo')

        self.assertEqual('foo', obj.id)
        self.assertEqual('bar', obj.api_key)

    def test_access(self):
        obj = libraries.stripe.resource.StripeObject('myid', 'mykey', myparam=5)

        # Empty
        self.assertRaises(AttributeError, getattr, obj, 'myattr')
        self.assertRaises(KeyError, obj.__getitem__, 'myattr')
        self.assertEqual('def', obj.get('myattr', 'def'))
        self.assertEqual(None, obj.get('myattr'))

        # Setters
        obj.myattr = 'myval'
        obj['myitem'] = 'itval'
        self.assertEqual('sdef', obj.setdefault('mydef', 'sdef'))

        # Getters
        self.assertEqual('myval', obj.setdefault('myattr', 'sdef'))
        self.assertEqual('myval', obj.myattr)
        self.assertEqual('myval', obj['myattr'])
        self.assertEqual('myval', obj.get('myattr'))

        self.assertEqual(['id', 'myattr', 'mydef', 'myitem'],
                         sorted(obj.keys()))
        self.assertEqual(['itval', 'myid', 'myval', 'sdef'],
                         sorted(obj.values()))

        # Illegal operations
        self.assertRaises(ValueError, setattr, obj, 'foo', '')

    def test_refresh_from(self):
        obj = libraries.stripe.resource.StripeObject.construct_from({
            'foo': 'bar',
            'trans': 'me',
        }, 'mykey')

        self.assertEqual('mykey', obj.api_key)
        self.assertEqual('bar', obj.foo)
        self.assertEqual('me', obj['trans'])
        self.assertEqual(None, obj.stripe_account)

        obj.refresh_from({
            'foo': 'baz',
            'johnny': 5,
        }, 'key2', stripe_account='acct_foo')

        self.assertEqual(5, obj.johnny)
        self.assertEqual('baz', obj.foo)
        self.assertRaises(AttributeError, getattr, obj, 'trans')
        self.assertEqual('key2', obj.api_key)
        self.assertEqual('acct_foo', obj.stripe_account)

        obj.refresh_from({
            'trans': 4,
            'metadata': {'amount': 42}
        }, 'key2', True)

        self.assertEqual('baz', obj.foo)
        self.assertEqual(4, obj.trans)

    def test_passing_nested_refresh(self):
        obj = libraries.stripe.resource.StripeObject.construct_from({
            'foos': {
                'type': 'list',
                'data': [
                    {'id': 'nested'}
                ],
            }
        }, 'key', stripe_account='acct_foo')

        nested = obj.foos.data[0]

        self.assertEqual('key', obj.api_key)
        self.assertEqual('nested', nested.id)
        self.assertEqual('key', nested.api_key)
        self.assertEqual('acct_foo', nested.stripe_account)

    def test_refresh_from_nested_object(self):
        obj = libraries.stripe.resource.StripeObject.construct_from(
            SAMPLE_INVOICE, 'key')

        self.assertEqual(1, len(obj.lines.subscriptions))
        self.assertTrue(
            isinstance(obj.lines.subscriptions[0],
                       libraries.stripe.resource.StripeObject))
        self.assertEqual('month', obj.lines.subscriptions[0].plan.interval)

    def test_to_json(self):
        obj = libraries.stripe.resource.StripeObject.construct_from(
            SAMPLE_INVOICE, 'key')

        self.check_invoice_data(util.json.loads(str(obj)))

    def check_invoice_data(self, data):
        # Check rough structure
        self.assertEqual(20, len(list(data.keys())))
        self.assertEqual(3, len(list(data['lines'].keys())))
        self.assertEqual(0, len(data['lines']['invoiceitems']))
        self.assertEqual(1, len(data['lines']['subscriptions']))

        # Check various data types
        self.assertEqual(1338238728, data['date'])
        self.assertEqual(None, data['next_payment_attempt'])
        self.assertEqual(False, data['livemode'])
        self.assertEqual('month',
                         data['lines']['subscriptions'][0]['plan']['interval'])

    def test_repr(self):
        obj = libraries.stripe.resource.StripeObject(
            'foo', 'bar', myparam=5)

        obj['object'] = '\u4e00boo\u1f00'

        res = repr(obj)

        if sys.version_info[0] < 3:
            res = str(repr(obj), 'utf-8')

        self.assertTrue('<StripeObject \u4e00boo\u1f00' in res)
        self.assertTrue('id=foo' in res)

    def test_pickling(self):
        obj = libraries.stripe.resource.StripeObject(
            'foo', 'bar', myparam=5)

        obj['object'] = 'boo'
        obj.refresh_from({'fala': 'lalala'}, api_key='bar', partial=True)

        self.assertEqual('lalala', obj.fala)

        pickled = pickle.dumps(obj)
        newobj = pickle.loads(pickled)

        self.assertEqual('foo', newobj.id)
        self.assertEqual('bar', newobj.api_key)
        self.assertEqual('boo', newobj['object'])
        self.assertEqual('lalala', newobj.fala)

    def test_deletion(self):
        obj = libraries.stripe.resource.StripeObject('id', 'key')

        obj.coupon = "foo"
        self.assertEqual('foo', obj.coupon)

        del obj.coupon
        self.assertRaises(AttributeError, getattr, obj, 'coupon')

        obj.refresh_from({'coupon': 'foo'}, api_key='bar', partial=True)
        self.assertEqual('foo', obj.coupon)
